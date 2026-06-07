import {
  insertScores,
  queryEvalCandidates,
  queryTraceSiblings,
  toClickHouseDateTime64,
  type EvalCandidateRow,
  type ScoreRow,
} from "@foglamp/clickhouse";
import {
  evalDefinition,
  evalState,
  providerCredential,
  type EvalConfig,
  type EvalFilters,
  type EvalModel,
} from "@foglamp/db/schema/eval";
import { env } from "@foglamp/env/server";
import { and, eq, sql } from "drizzle-orm";

import { buildContext, type ContextSpec } from "../evals/context";
import { runCodeScorer } from "../evals/codeScorers";
import { runJudge } from "../evals/judge";
import { getPreset, type Preset } from "../evals/presets";
import { decryptSecret } from "../lib/crypto";
import type { Ch, Db, Log } from "../types";
import type { ScoringTarget, SiblingSpan } from "../evals/types";

// The transaction handle drizzle hands to `db.transaction(async (tx) => …)`.
// Derived from Db so it tracks the schema without importing drizzle internals.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The scoring worker: the eval-side sibling of the alert evaluator. Each sweep
// finds new traces/spans matching each enabled eval (since its watermark),
// samples them, runs the code/judge scorer, writes scores, and advances the
// watermark. Out of band from ingest — never blocks span writes.

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return out;
}

function toScore(passed: boolean | null): number | null {
  return passed === null ? null : passed ? 1 : 0;
}

export async function evaluateEvals(db: Db, ch: Ch, log: Log): Promise<void> {
  const evals = await db
    .select({ ev: evalDefinition, st: evalState })
    .from(evalDefinition)
    .leftJoin(evalState, eq(evalState.evalId, evalDefinition.id))
    .where(eq(evalDefinition.enabled, true));

  for (const { ev, st } of evals) {
    try {
      await scoreOneEval(db, ch, log, ev, st?.watermark ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("eval.sweep_failed", { evalId: ev.id, error: message });
      await db
        .insert(evalState)
        .values({ evalId: ev.id, status: "error", lastError: message })
        .onConflictDoUpdate({
          target: evalState.evalId,
          set: { status: "error", lastError: message },
        });
    }
  }
}

async function scoreOneEval(
  db: Db,
  ch: Ch,
  log: Log,
  ev: typeof evalDefinition.$inferSelect,
  watermark: Date | null,
): Promise<void> {
  const preset = getPreset(ev.presetId);
  if (!preset) throw new Error(`unknown preset: ${ev.presetId}`);

  // Resolve the BYOK judge key up front; pause (don't error) if it's missing.
  let apiKey: string | null = null;
  const model = ev.model as EvalModel | null;
  if (preset.source === "llm") {
    if (!model) throw new Error("llm eval has no model configured");
    const cred = await db.query.providerCredential.findFirst({
      where: and(
        eq(providerCredential.projectId, ev.projectId),
        eq(providerCredential.provider, model.provider),
      ),
    });
    if (!cred) {
      await setState(db, ev.id, watermark, "paused_no_key", `no ${model.provider} key`);
      return;
    }
    apiKey = decryptSecret(cred);
  }

  const until = new Date(Date.now() - env.SCORING_SETTLE_MS);
  const since = watermark ?? until; // no state yet → start now (future-only)
  if (since >= until) {
    await setState(db, ev.id, until, "ok", null);
    return;
  }

  const filters = { ...(ev.filters ?? {}) } as EvalFilters;
  // Scope tool presets to tool spans unless the eval set its own span-type
  // filter — otherwise they'd fire on every span (e.g. flagging an LLM span's
  // message-array input as "not a JSON object").
  if (preset.spanType && !filters.spanType) filters.spanType = preset.spanType;
  const sampleRate = Number(ev.sampleRate);

  // Claim the [since, newWatermark) window before any judge call. The worker
  // has no cross-process lock — the `running` guard in scoringCron is per-process
  // only — so multiple instances (replicas, or dev hot-reloads each firing an
  // immediate tick) read the same watermark, build the same batch, and each one
  // independently calls (and pays for) the judge. Scores collapse in storage
  // (ReplacingMergeTree on score_id), so the redundant work was invisible except
  // as wasted spend: the "2 spans → 84 LLM calls" blowup.
  //
  // Two layers, both inside one short Postgres transaction that never spans an
  // LLM call:
  //   1. A per-eval advisory lock (fast path). A concurrent sweep that can't grab
  //      it bails immediately — skipping even the candidate read. The lock is
  //      transaction-scoped so the pool can't unlock it on the wrong connection,
  //      and it auto-releases at commit, well before scoring.
  //   2. A compare-and-swap on the watermark (correctness). Even if two sweeps
  //      somehow both reach the CAS, only one advances the watermark and wins.
  // Trade-off: the watermark moves before scores are written, so a hard crash
  // mid-sweep skips that window rather than risk re-scoring (and re-billing) it.
  const claim = await db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${ev.id})) AS locked`,
    );
    if (!lock.rows[0]?.locked) return null;

    const candidates = await queryEvalCandidates(ch, {
      projectId: ev.projectId,
      level: ev.targetLevel,
      filters,
      since: toClickHouseDateTime64(since.getTime()),
      until: toClickHouseDateTime64(until.getTime()),
      sampleThousandths: Math.max(0, Math.min(1000, Math.round(sampleRate * 1000))),
      limit: env.EVAL_SCORING_BATCH,
    });

    // When the batch is capped, trim trailing rows that share the last row's
    // ingested_at so we never end mid-millisecond: the watermark lands on a clean
    // boundary and strict `ingested_at > watermark` re-fetches the trimmed ties
    // next sweep — no skipped spans, no re-scored (re-judged) spans. If the whole
    // batch is one millisecond (pathological), score it all and advance past it.
    let batch = candidates;
    let newWatermark = until;
    if (candidates.length === env.EVAL_SCORING_BATCH) {
      const lastTs = candidates[candidates.length - 1]!.ingested_at;
      const trimmed = candidates.filter((c) => c.ingested_at !== lastTs);
      if (trimmed.length > 0) {
        batch = trimmed;
        newWatermark = new Date(trimmed[trimmed.length - 1]!.ingested_at + "Z");
      } else {
        newWatermark = new Date(lastTs + "Z");
      }
    }

    if (!(await claimScoringWindow(tx, ev.id, since, newWatermark))) return null;
    return { batch };
  });

  if (!claim) {
    log.info("eval.sweep_skipped_concurrent", { evalId: ev.id, since });
    return;
  }
  const { batch } = claim;

  if (batch.length > 0) {
    const config = (ev.config ?? {}) as EvalConfig;
    const contextSpec = (config.contextSpec ?? {}) as ContextSpec;
    const params = config.params ?? preset.defaultParams ?? {};
    const siblingCache = new Map<string, SiblingSpan[]>();
    const now = Date.now();

    const results = await mapLimit(
      batch,
      env.EVAL_JUDGE_CONCURRENCY,
      async (c): Promise<ScoreRow | null> => {
        try {
          const target = await buildTarget(ch, ev, c, preset, siblingCache);
          const extracted = buildContext(target, preset, contextSpec);
          const { result, cost, truncated } =
            preset.source === "code"
              ? {
                  result: runCodeScorer(preset.id, extracted, params),
                  cost: null,
                  truncated: false,
                }
              : await runJudge({
                  provider: model!.provider,
                  apiKey: apiKey!,
                  modelId: model!.modelId,
                  preset,
                  extracted,
                  maxInputChars: env.EVAL_JUDGE_MAX_INPUT_CHARS,
                  promptOverride: config.promptOverride,
                });
          return {
            project_id: ev.projectId,
            eval_id: ev.id,
            score_id: `${ev.id}:${c.target_id}`,
            target_type: ev.targetLevel,
            target_id: c.target_id,
            trace_id: c.trace_id,
            scorer: preset.source,
            label: "",
            score: result.score,
            passed: toScore(result.passed),
            reason: truncated
              ? `[judged on truncated payload] ${result.reason}`
              : result.reason,
            model_id: preset.source === "llm" ? model!.modelId : "",
            cost,
            scored_at: now,
          };
        } catch (err) {
          log.error("eval.score_failed", {
            evalId: ev.id,
            targetId: c.target_id,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      },
    );

    await insertScores(ch, results.filter((r): r is ScoreRow => r !== null));
  }

  // Watermark was already advanced by the claim above — no second write here.
  log.info("eval.scored", { evalId: ev.id, scored: batch.length });
}

async function buildTarget(
  ch: Ch,
  ev: typeof evalDefinition.$inferSelect,
  c: EvalCandidateRow,
  preset: Preset,
  siblingCache: Map<string, SiblingSpan[]>,
): Promise<ScoringTarget> {
  let siblings: SiblingSpan[] = [];
  if (preset.needsContext || preset.needsTools) {
    siblings = siblingCache.get(c.trace_id) ?? [];
    if (!siblingCache.has(c.trace_id)) {
      const rows = await queryTraceSiblings(ch, {
        projectId: ev.projectId,
        traceId: c.trace_id,
      });
      siblings = rows.map((r) => ({
        spanId: r.span_id,
        spanType: r.span_type,
        output: r.output,
        startTimeMs: r.start_time_ms,
        toolCatalog: r.tool_catalog,
      }));
      siblingCache.set(c.trace_id, siblings);
    }
  }
  return {
    level: ev.targetLevel,
    targetId: c.target_id,
    traceId: c.trace_id,
    spanType: c.span_type,
    startTimeMs: c.start_time_ms,
    input: c.input,
    output: c.output,
    metadata: c.metadata ?? {},
    siblings,
  };
}

/**
 * Atomically advance the watermark from its observed value (`since`) to
 * `newWatermark`, claiming the window for this sweep. Returns false when a
 * concurrent sweep already advanced it — the caller then skips scoring and makes
 * zero judge calls. This is the worker's only cross-process mutual exclusion:
 * a single conditional UPDATE, serialized by Postgres row locking.
 *
 * The compare is `date_trunc('milliseconds', watermark) = since` rather than a
 * plain equality because `eval_state.watermark` defaults to `now()` (microsecond
 * precision) while every value we read/write round-trips through a JS `Date`
 * (millisecond precision). A raw `=` would never match a microsecond-tailed
 * default, silently wedging the eval so it never scores.
 */
async function claimScoringWindow(
  db: Db | Tx,
  evalId: string,
  since: Date,
  newWatermark: Date,
): Promise<boolean> {
  const claimed = await db
    .update(evalState)
    .set({
      watermark: newWatermark,
      status: "ok",
      lastError: null,
      lastScoredAt: new Date(),
    })
    .where(
      and(
        eq(evalState.evalId, evalId),
        sql`date_trunc('milliseconds', ${evalState.watermark}) = ${since}`,
      ),
    )
    .returning({ evalId: evalState.evalId });
  return claimed.length > 0;
}

async function setState(
  db: Db,
  evalId: string,
  watermark: Date | null,
  status: "ok" | "paused_no_key" | "error",
  lastError: string | null,
): Promise<void> {
  const set = {
    status,
    lastError,
    ...(watermark ? { watermark } : {}),
    ...(status === "ok" ? { lastScoredAt: new Date() } : {}),
  };
  await db
    .insert(evalState)
    .values({ evalId, ...(watermark ? { watermark } : {}), status, lastError })
    .onConflictDoUpdate({ target: evalState.evalId, set });
}
