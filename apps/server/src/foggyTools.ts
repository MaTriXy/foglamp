import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import type { Ch } from "@foglamp/api/types";
import { getAgentList } from "@foglamp/api/services/agents";
import { getAlertHistory, listAlerts } from "@foglamp/api/services/alerts";
import { getCustomerList } from "@foglamp/api/services/customers";
import { listEvals, listRecentScores } from "@foglamp/api/services/evals";
import {
  getCostTimeseriesByModel,
  getModelBreakdown,
  getSummary,
  getTimeseries,
} from "@foglamp/api/services/metrics";
import { getSessionDetail, getSessionList } from "@foglamp/api/services/sessions";
import { getTraceDetail, getTraceList } from "@foglamp/api/services/traces";
import { getWorkflowList } from "@foglamp/api/services/workflowRuns";

// Tools are bound to one authenticated user + project. Every wrapped service
// already calls requireProjectAccess(db, userId, projectId), so the user can
// never read another project's data. Tools are read-only.
// defaultWindow is the time range the user has selected in the app; tools fall
// back to it (then to the last 7 days) when the model doesn't name a window, so
// Foggy's numbers match what's on screen.
type ToolCtx = {
  ch: Ch;
  userId: string;
  projectId: string;
  defaultWindow?: { from: Date; to: Date };
};

const DAY_MS = 86_400_000;

// Optional ISO from/to → concrete Dates, defaulting to the user's selected range.
const windowInput = {
  from: z
    .string()
    .optional()
    .describe(
      "Start of the window, ISO 8601. Defaults to the start of the time range the user has selected in the app.",
    ),
  to: z
    .string()
    .optional()
    .describe(
      "End of the window, ISO 8601. Defaults to the end of the user's selected range (usually now).",
    ),
};

// User-controlled strings (span names, error messages, trace/agent/workflow
// names arrive verbatim from customer SDK payloads) are wrapped in delimiters
// so the model treats them as opaque data rather than instructions — the
// prompt-injection mitigation paired with the rule in foggy.ts's system prompt.
// Exported so the current-page resolver in foggy.ts can wrap names/ids pulled
// from the (client-supplied) pathname before they reach the system prompt.
export function untrusted(v: string | null | undefined): string | null {
  if (v == null || v === "") return v ?? null;
  return `[BEGIN_UNTRUSTED]${v}[END_UNTRUSTED]`;
}

// Truncate free-form customer text (session messages, score reasons) before it
// goes back to the model — a single session turn or judge rationale can be huge,
// and Foggy only needs the gist. Marks where it cut so the model knows it's a
// preview. Pair with untrusted() for the prompt-injection wrapping.
function clip(v: string | null | undefined, max: number): string | null {
  if (v == null || v === "") return null;
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

// Docs corpus fetcher: Mintlify auto-serves /llms.txt (index + summaries) and
// /llms-full.txt (the whole docs text). Cached in-process for 5 minutes and
// capped so a runaway docs build can't blow up the model context; on fetch
// failure a stale cache entry beats nothing.
const DOCS_CACHE_TTL_MS = 5 * 60 * 1000;
const DOCS_MAX_CHARS = 80_000;
const docsCache = new Map<string, { text: string; fetchedAt: number }>();

async function fetchDocs(full: boolean): Promise<string | null> {
  const path = full ? "/llms-full.txt" : "/llms.txt";
  const cached = docsCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < DOCS_CACHE_TTL_MS) {
    return cached.text;
  }
  try {
    const res = await fetch(new URL(path, env.FOGGY_DOCS_URL), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return cached?.text ?? null;
    const text = (await res.text()).slice(0, DOCS_MAX_CHARS);
    docsCache.set(path, { text, fetchedAt: Date.now() });
    return text;
  } catch {
    return cached?.text ?? null;
  }
}

export function buildFoggyTools({
  ch,
  userId,
  projectId,
  defaultWindow,
}: ToolCtx): ToolSet {
  // The window a tool uses when the model omits from/to: the user's selected
  // range, else the last 7 days. Each field falls back independently so a
  // half-specified window still resolves sensibly.
  const fallback = defaultWindow ?? {
    from: new Date(Date.now() - 7 * DAY_MS),
    to: new Date(),
  };
  const resolveWindow = (from?: string, to?: string) => ({
    from: from ? new Date(from) : fallback.from,
    to: to ? new Date(to) : fallback.to,
  });

  return {
    getProjectSummary: tool({
      description:
        "Totals for the current project over a window — cost, tokens (in/out), request/span counts, error rate, and latency/TTFT percentiles (p50/p95/p99). Includes the previous equal-length window for comparison.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        return getSummary(db, ch, userId, { projectId, ...w });
      },
    }),

    listTraces: tool({
      description:
        "List traces (one trace = one top-level generateText/streamText call) in a window. Newest first by default; filter by agent name, trace name, or errors-only, and sort/paginate. Each row includes a `link` to open it in the dashboard.",
      inputSchema: z.object({
        ...windowInput,
        agentName: z
          .string()
          .optional()
          .describe("Only traces for this agent (exact match)."),
        traceName: z
          .string()
          .optional()
          .describe("Only traces with this name (exact match)."),
        errorsOnly: z
          .boolean()
          .optional()
          .describe("Only traces that had at least one error."),
        sort: z
          .object({
            field: z.enum(["when", "cost", "duration", "tokens", "spans"]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional()
          .describe("Sort order. Defaults to newest first."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip, for paging. Default 0."),
      }),
      execute: async ({ from, to, agentName, traceName, errorsOnly, sort, limit, offset }) => {
        const w = resolveWindow(from, to);
        const { traces } = await getTraceList(db, ch, userId, {
          projectId,
          ...w,
          agentName,
          traceName,
          errorsOnly,
          sort,
          limit: limit ?? 15,
          offset,
        });
        return traces.map((t) => ({
          traceId: t.traceId,
          name: untrusted(t.traceName ?? t.agentName ?? null),
          workflowName: untrusted(t.workflowName),
          startTime: t.startTime,
          durationMs: t.durationMs,
          spanCount: t.spanCount,
          errorCount: t.errorCount,
          totalTokens: t.totalTokens,
          totalCost: t.totalCost,
          link: `/traces/${encodeURIComponent(t.traceId)}`,
        }));
      },
    }),

    getTrace: tool({
      description:
        "Get the span breakdown for one trace by id (steps, tools, models, status, timings). Use to explain why a trace was slow, expensive, or errored.",
      inputSchema: z.object({ traceId: z.string() }),
      execute: async ({ traceId }) => {
        const detail = await getTraceDetail(db, ch, userId, { projectId, traceId });
        // Drop the large input/output payloads to keep the tool result small, but
        // keep the per-dimension token + cost split so questions like "how much of
        // this was prompt vs completion?" can be answered without the dashboard.
        const spans = detail.spans.slice(0, 60).map((s) => ({
          name: untrusted(s.name),
          spanType: s.spanType,
          status: s.status,
          errorMessage: untrusted(s.errorMessage),
          modelId: s.modelId,
          durationMs: s.durationMs,
          ttftMs: s.ttftMs,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          reasoningTokens: s.reasoningTokens,
          cachedInputTokens: s.cachedInputTokens,
          totalTokens: s.totalTokens,
          promptCost: s.promptCost,
          completionCost: s.completionCost,
          reasoningCost: s.reasoningCost,
          cacheReadCost: s.cacheReadCost,
          cacheWriteCost: s.cacheWriteCost,
          totalCost: s.totalCost,
        }));
        return { traceId, link: `/traces/${encodeURIComponent(traceId)}`, spans };
      },
    }),

    getTraceIO: tool({
      description:
        "Read the actual input/output payloads of a trace's spans by id — the prompt/messages sent in and the model or tool output. Use to explain WHY a trace produced a wrong, odd, or empty answer; metrics alone don't show content. Only spans that carry content are returned, and each payload is truncated.",
      inputSchema: z.object({
        traceId: z.string(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Max spans (with content) to return, in tree order. Default 6."),
      }),
      execute: async ({ traceId, limit }) => {
        const detail = await getTraceDetail(db, ch, userId, { projectId, traceId });
        const withIO = detail.spans.filter((s) => s.input || s.output);
        const spans = withIO.slice(0, limit ?? 6).map((s) => ({
          name: untrusted(s.name),
          spanType: s.spanType,
          modelId: s.modelId,
          status: s.status,
          // Customer payloads: clipped to bound context, untrusted-wrapped so the
          // model treats their contents as data, not instructions.
          input: untrusted(clip(s.input, 2500)),
          output: untrusted(clip(s.output, 2500)),
        }));
        return {
          traceId,
          link: `/traces/${encodeURIComponent(traceId)}`,
          spansReturned: spans.length,
          spansWithContent: withIO.length,
          spans,
        };
      },
    }),

    breakdownByModel: tool({
      description:
        "Per-model breakdown over a window — request count, tokens, p95 latency, and cost. Use for 'which model costs the most'.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        return getModelBreakdown(db, ch, userId, { projectId, ...w });
      },
    }),

    listAgents: tool({
      description:
        "Per-agent breakdown over a window — cost, errors, tokens, p95 latency. Each row includes a `link` to the agent's page.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        const { agents } = await getAgentList(db, ch, userId, { projectId, ...w });
        return agents.map((a) => ({
          ...a,
          // Customer-supplied name: untrusted-wrapped for the model; the link
          // keeps the raw value so the URL stays navigable.
          agentName: untrusted(a.agentName),
          link: `/agents/${encodeURIComponent(a.agentName)}`,
        }));
      },
    }),

    listWorkflows: tool({
      description:
        "Workflows active in a window, grouped by name — run count, cost, errors, last run. Each row includes a `link` to the workflow's page.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        const { workflows } = await getWorkflowList(db, ch, userId, { projectId, ...w });
        return workflows.map((wf) => ({
          ...wf,
          workflowName: untrusted(wf.workflowName),
          link: wf.workflowName
            ? `/workflows/${encodeURIComponent(wf.workflowName)}`
            : "/workflows/~ungrouped",
        }));
      },
    }),

    listCustomers: tool({
      description:
        "Per-customer cost breakdown over a window, ranked by spend (a customer is the end-customer a call serves, tagged via the SDK's `customer` field). Returns cost, requests, errors, tokens, and first/last-seen per customer — use for 'which customer costs the most' or usage-based-pricing questions. Customers appear on the Overview's Customers card; there's no dedicated page, so rows have no link. Only traces tagged with a customer are included.",
      inputSchema: z.object({
        ...windowInput,
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
      }),
      execute: async ({ from, to, limit }) => {
        const w = resolveWindow(from, to);
        const { customers } = await getCustomerList(db, ch, userId, {
          projectId,
          ...w,
          limit: limit ?? 15,
        });
        return customers.map((c) => ({
          customerId: c.customerId,
          // Customer-supplied display name: untrusted-wrapped for the model.
          customerName: untrusted(c.customerName),
          spanCount: c.spanCount,
          errorCount: c.errorCount,
          totalCost: c.totalCost,
          totalTokens: c.totalTokens,
          firstSeen: c.firstSeen,
          lastSeen: c.lastSeen,
        }));
      },
    }),

    listSessions: tool({
      description:
        "List conversation sessions (a session groups the traces that share a sessionId — e.g. one chat thread) in a window. Filter by agent name or errors-only, sort, and paginate. Returns a summary (session/error counts, total cost/tokens) plus rows; each row includes a `link` to the session.",
      inputSchema: z.object({
        ...windowInput,
        agentName: z
          .string()
          .optional()
          .describe("Only sessions for this agent (exact match)."),
        errorsOnly: z
          .boolean()
          .optional()
          .describe("Only sessions that had at least one error."),
        sort: z
          .object({
            field: z.enum(["last", "cost", "tokens", "turns"]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional()
          .describe("Sort order. Defaults to most recent first."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip, for paging. Default 0."),
      }),
      execute: async ({ from, to, agentName, errorsOnly, sort, limit, offset }) => {
        const w = resolveWindow(from, to);
        const { summary, sessions } = await getSessionList(db, ch, userId, {
          projectId,
          ...w,
          agentName,
          errorsOnly,
          sort,
          limit: limit ?? 15,
          offset,
        });
        return {
          summary,
          sessions: sessions.map((s) => ({
            sessionId: s.sessionId,
            agentName: untrusted(s.agentName),
            turnCount: s.turnCount,
            spanCount: s.spanCount,
            errorCount: s.errorCount,
            totalCost: s.totalCost,
            totalTokens: s.totalTokens,
            firstSeen: s.firstSeen,
            lastSeen: s.lastSeen,
            link: `/sessions/${encodeURIComponent(s.sessionId)}`,
          })),
        };
      },
    }),

    getSession: tool({
      description:
        "Get one conversation session by id — its turns in order (each turn is a trace: the user message, a short assistant output preview, status, cost, tokens) plus session totals. Use to explain what happened in a chat thread.",
      inputSchema: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => {
        const detail = await getSessionDetail(db, ch, userId, { projectId, sessionId });
        // Cap the turns and clip the free-form message text — a long session can
        // carry hundreds of turns with large payloads.
        const turns = detail.turns.slice(0, 30).map((t) => ({
          traceId: t.traceId,
          name: untrusted(t.name),
          status: t.status,
          durationMs: t.durationMs,
          totalCost: t.totalCost,
          totalTokens: t.totalTokens,
          errorCount: t.errorCount,
          userMessage: untrusted(clip(t.userMessage, 300)),
          assistantOutput: untrusted(clip(t.assistantOutput, 300)),
          link: `/traces/${encodeURIComponent(t.traceId)}`,
        }));
        return {
          sessionId: detail.sessionId,
          agentName: untrusted(detail.agentName),
          stats: detail.stats,
          turnsReturned: turns.length,
          totalTurns: detail.turns.length,
          link: `/sessions/${encodeURIComponent(detail.sessionId)}`,
          turns,
        };
      },
    }),

    listEvals: tool({
      description:
        "List the evals (automated scorers) configured for this project, with their windowed results — score count, pass rate, average score, spend, status, and last run. Each row includes a `link` to the eval. Use for 'how are my evals doing' or to find an eval's id.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        const evals = await listEvals(db, ch, userId, { projectId, ...w });
        return evals.map((e) => ({
          id: e.id,
          name: untrusted(e.name),
          presetId: e.presetId,
          targetLevel: e.targetLevel,
          enabled: e.enabled,
          status: e.status,
          scoreCount: e.scoreCount,
          passRate: e.passRate,
          avgScore: e.avgScore,
          cost: e.cost,
          lastScoredAt: e.lastScoredAt,
          link: `/evals/${encodeURIComponent(e.id)}`,
        }));
      },
    }),

    getEvalScores: tool({
      description:
        "Recent individual scores for one eval by id — per-score label, numeric score, pass/fail verdict, the judge's reason, model, cost, and the trace it scored. Use to inspect why an eval is passing/failing or to surface the worst scores (sort by score asc).",
      inputSchema: z.object({
        evalId: z.string(),
        ...windowInput,
        sort: z
          .object({
            field: z.literal("score"),
            dir: z.enum(["asc", "desc"]),
          })
          .optional()
          .describe("Sort by score. Defaults to most recent first."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip, for paging. Default 0."),
      }),
      execute: async ({ evalId, from, to, sort, limit, offset }) => {
        const w = resolveWindow(from, to);
        // Keep Foggy bound to the current project. listRecentScores resolves
        // access via the eval's *own* project, so for a multi-project user it
        // could otherwise read an eval outside the one we're scoped to; gate on
        // this project's eval list first (cheap — definitions only, no window).
        const evals = await listEvals(db, ch, userId, { projectId });
        if (!evals.some((e) => e.id === evalId)) {
          return { evalId, error: "No eval with that id exists in this project." };
        }
        const { scores, total } = await listRecentScores(db, ch, userId, {
          evalId,
          ...w,
          sort,
          limit: limit ?? 15,
          offset,
        });
        return {
          evalId,
          total,
          link: `/evals/${encodeURIComponent(evalId)}`,
          scores: scores.map((s) => ({
            scoreId: s.scoreId,
            traceId: s.traceId,
            targetType: s.targetType,
            label: untrusted(s.label),
            score: s.score,
            passed: s.passed,
            reason: untrusted(clip(s.reason, 500)),
            modelId: s.modelId,
            cost: s.cost,
            scoredAt: s.scoredAt,
            link: `/traces/${encodeURIComponent(s.traceId)}`,
          })),
        };
      },
    }),

    listAlerts: tool({
      description:
        "List this project's alert rules and their current state — metric, comparison, threshold, window, enabled, status, the last evaluated value, and when each last fired. Use for 'what alerts do I have' or 'which alerts are firing'.",
      inputSchema: z.object({}),
      execute: async () => {
        const alerts = await listAlerts(db, userId, projectId);
        return alerts.map((a) => ({
          id: a.id,
          name: a.name,
          metric: a.metric,
          comparison: a.comparison,
          threshold: a.threshold,
          windowSeconds: a.windowSeconds,
          enabled: a.enabled,
          status: a.status,
          lastValue: a.lastValue,
          lastFiredAt: a.lastFiredAt,
          lastEvaluatedAt: a.lastEvaluatedAt,
          evalId: a.evalId,
          link: "/alerts",
        }));
      },
    }),

    getAlertHistory: tool({
      description:
        "Recent firing/resolve history for one alert rule by id — each event's type, the metric value, and the threshold at that time. Use for 'how often has this alert fired' or 'when did it last trip'.",
      inputSchema: z.object({
        ruleId: z.string(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20."),
      }),
      execute: async ({ ruleId, limit }) => {
        // Same cross-project guard as getEvalScores: the underlying service
        // resolves access via the rule's own project, so confirm it belongs to
        // the one we're scoped to first.
        const alerts = await listAlerts(db, userId, projectId);
        if (!alerts.some((a) => a.id === ruleId)) {
          return { ruleId, error: "No alert rule with that id exists in this project." };
        }
        const events = await getAlertHistory(db, userId, { ruleId, limit: limit ?? 20 });
        return { ruleId, events };
      },
    }),

    getTimeseries: tool({
      description:
        "Time-bucketed trend over a window — per bucket: span and error counts, cost, tokens (in/out), and latency/TTFT percentiles. Bucket size auto-scales to the window. Optionally narrow to one model, agent, or span type. Use for cost/latency/error trends and spotting spikes over time.",
      inputSchema: z.object({
        ...windowInput,
        modelId: z.string().optional().describe("Only this model id."),
        agentName: z.string().optional().describe("Only this agent (exact match)."),
        spanType: z
          .string()
          .optional()
          .describe("Only this span type, e.g. 'llm'."),
      }),
      execute: async ({ from, to, modelId, agentName, spanType }) => {
        const w = resolveWindow(from, to);
        return getTimeseries(db, ch, userId, {
          projectId,
          ...w,
          modelId,
          agentName,
          spanType,
        });
      },
    }),

    getCostTimeseriesByModel: tool({
      description:
        "Time-bucketed cost per model over a window (one row per bucket + model) — for a stacked 'cost over time by model' view or to see which model drove a spike.",
      inputSchema: z.object(windowInput),
      execute: async ({ from, to }) => {
        const w = resolveWindow(from, to);
        return getCostTimeseriesByModel(db, ch, userId, { projectId, ...w });
      },
    }),

    searchDocs: tool({
      description:
        "Fetch the Foglamp documentation for how the product works (SDK usage, the data model, concepts, self-hosting). Use for 'how do I…' questions. Returns the docs index with per-page summaries; set full=true when you need the complete docs text to answer precisely.",
      inputSchema: z.object({
        full: z
          .boolean()
          .optional()
          .describe(
            "Fetch the full documentation text instead of the index. Slower and much larger; use only when the index isn't enough.",
          ),
      }),
      execute: async ({ full }) => {
        const text = await fetchDocs(full ?? false);
        if (!text) {
          return {
            unavailable: true,
            note: `The docs site is unreachable right now. Point the user at ${env.FOGGY_DOCS_URL}.`,
          };
        }
        return { source: env.FOGGY_DOCS_URL, text };
      },
    }),
  };
}
