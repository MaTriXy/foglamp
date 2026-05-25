// Dev-only test-data generator. Synthesizes realistic spans and inserts them
// straight into ClickHouse (same `spans` table ingest writes to), so the
// rollup materialized views — trace_summary, workflow_run_summary,
// metrics_by_minute — populate exactly as they would from real traffic. The
// surfacing UI (the Admin tab) is gated to development; these procedures stay
// project-access-checked so they're safe even against a production server.
import {
  type CostBreakdown,
  EMPTY_BREAKDOWN,
  getPricingTable,
  type PricingTable,
  priceSpan,
} from "@foglamp/cost";
import { insertSpans, type SpanRow } from "@foglamp/clickhouse";
import { uuidv7 } from "uuidv7";

import type { Ch } from "../types";
import { requireProjectAccess } from "./access";

export const TEST_KINDS = [
  "bare",
  "agent",
  "workflow",
  "tool",
  "full",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];

// OpenRouter canonical ids (provider/model). Passed verbatim so they resolve
// against the pricing table without normalization guesswork; at runtime we keep
// only the ones actually present so cost computes instead of going null.
const CANDIDATE_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-small",
  "deepseek/deepseek-chat",
  "x-ai/grok-2-1212",
];

function pickModels(table: PricingTable): string[] {
  const present = CANDIDATE_MODELS.filter((id) => table.has(id));
  return present.length > 0 ? present : CANDIDATE_MODELS;
}

const rnd = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length)]!;

function costCols(c: CostBreakdown) {
  return {
    prompt_cost: c.promptCost,
    completion_cost: c.completionCost,
    request_cost: c.requestCost,
    image_cost: c.imageCost,
    web_search_cost: c.webSearchCost,
    internal_reasoning_cost: c.internalReasoningCost,
    cache_read_cost: c.cacheReadCost,
    cache_write_cost: c.cacheWriteCost,
    total_cost: c.totalCost,
  };
}

function emptyRow(projectId: string, start: number): SpanRow {
  return {
    project_id: projectId,
    trace_id: "",
    span_id: "",
    parent_span_id: "",
    span_type: "agent",
    name: "",
    start_time: start,
    end_time: start,
    duration_ms: 0,
    status: "ok",
    error_message: "",
    provider: "",
    model_id: "",
    priced_model_id: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    reasoning_tokens: 0,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    image_count: 0,
    web_search_count: 0,
    request_count: 0,
    ttft_ms: null,
    ...costCols(EMPTY_BREAKDOWN),
    pricing_source: "",
    priced_at: null,
    agent_name: "",
    workflow_name: "",
    workflow_run_id: "",
    session_id: "",
    metadata: {},
    input: "",
    output: "",
  };
}

type TraceCtx = {
  projectId: string;
  table: PricingTable;
  now: number;
  rows: SpanRow[];
};

/**
 * Build one trace: a root "agent" span plus the given child steps. Each LLM
 * step is priced; tool steps carry input/output but no cost.
 */
function makeTrace(
  c: TraceCtx,
  opts: {
    startedAgo: number; // ms before now the trace started
    agentName?: string;
    workflowName?: string;
    workflowRunId?: string;
    sessionId?: string;
    models: string[]; // one llm step per entry
    withTool?: boolean;
    error?: boolean;
    metadata?: Record<string, string>;
  },
) {
  const traceId = uuidv7();
  const start = c.now - opts.startedAgo;
  const meta = opts.metadata ?? {};
  let cursor = start;
  const children: SpanRow[] = [];

  let stepIndex = 0;
  for (const modelId of opts.models) {
    const provider = modelId.split("/")[0]!;
    const inputTokens = rnd(400, 3200);
    const outputTokens = rnd(80, 900);
    const cachedInputTokens = Math.random() < 0.5 ? rnd(0, inputTokens) : 0;
    const usage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      reasoningTokens: 0,
      cachedInputTokens,
      cacheWriteInputTokens: 0,
      imageCount: 0,
      webSearchCount: 0,
      requestCount: 1,
    };
    const priced = priceSpan({ table: c.table, provider, modelId, usage });
    const dur = rnd(300, 4000);
    const stepStart = cursor;
    const stepEnd = stepStart + dur;
    cursor = stepEnd;
    const isLastStep = stepIndex === opts.models.length - 1;
    const stepErr = opts.error === true && isLastStep;

    children.push({
      ...emptyRow(c.projectId, stepStart),
      trace_id: traceId,
      span_id: `${traceId}:step:${stepIndex}`,
      parent_span_id: `${traceId}:root`,
      span_type: "llm",
      name: `generate (${modelId})`,
      start_time: stepStart,
      end_time: stepEnd,
      duration_ms: dur,
      status: stepErr ? "error" : "ok",
      error_message: stepErr ? "Upstream model returned 529 (overloaded)" : "",
      provider,
      model_id: modelId,
      priced_model_id: priced.resolvedId,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      cached_input_tokens: usage.cachedInputTokens,
      request_count: 1,
      ttft_ms: Math.round(dur * (0.25 + Math.random() * 0.4)),
      ...costCols(priced.costs),
      pricing_source: priced.source ?? "",
      priced_at: priced.source ? c.now : null,
      agent_name: opts.agentName ?? "",
      workflow_name: opts.workflowName ?? "",
      workflow_run_id: opts.workflowRunId ?? "",
      session_id: opts.sessionId ?? "",
      metadata: meta,
      input: JSON.stringify([{ role: "user", content: "What is Foglamp?" }]),
      output: stepErr ? "" : "Foglamp is an observability platform for AI agents.",
    });
    stepIndex += 1;

    // Insert a tool span after the first step when requested.
    if (opts.withTool && stepIndex === 1) {
      const tdur = rnd(80, 600);
      const tStart = cursor;
      const tEnd = tStart + tdur;
      cursor = tEnd;
      children.push({
        ...emptyRow(c.projectId, tStart),
        trace_id: traceId,
        span_id: `${traceId}:tool:${uuidv7()}`,
        parent_span_id: `${traceId}:root`,
        span_type: "tool",
        name: "web_search",
        start_time: tStart,
        end_time: tEnd,
        duration_ms: tdur,
        status: "ok",
        agent_name: opts.agentName ?? "",
        workflow_name: opts.workflowName ?? "",
        workflow_run_id: opts.workflowRunId ?? "",
        session_id: opts.sessionId ?? "",
        metadata: meta,
        input: JSON.stringify({ query: "foglamp ai observability" }),
        output: JSON.stringify({ results: 5 }),
      });
    }
  }

  const end = cursor;
  // Root agent span spans the whole trace; it is unpriced (cost lives on llm
  // spans to avoid double-counting in the rollups).
  c.rows.push({
    ...emptyRow(c.projectId, start),
    trace_id: traceId,
    span_id: `${traceId}:root`,
    parent_span_id: "",
    span_type: "agent",
    name: opts.agentName ?? "generateText",
    start_time: start,
    end_time: end,
    duration_ms: end - start,
    status: opts.error ? "error" : "ok",
    agent_name: opts.agentName ?? "",
    workflow_name: opts.workflowName ?? "",
    workflow_run_id: opts.workflowRunId ?? "",
    session_id: opts.sessionId ?? "",
    metadata: meta,
  });
  c.rows.push(...children);
  return traceId;
}

function buildRows(projectId: string, kind: TestKind, table: PricingTable) {
  const now = Date.now();
  const c: TraceCtx = { projectId, table, now, rows: [] };
  const models = pickModels(table);

  if (kind === "bare") {
    makeTrace(c, { startedAgo: rnd(5_000, 60_000), models: [models[0]!] });
  } else if (kind === "agent") {
    makeTrace(c, {
      startedAgo: rnd(5_000, 60_000),
      agentName: "support-bot",
      models: [pick(models), pick(models)],
      metadata: { env: "test", scenario: "agent" },
    });
  } else if (kind === "workflow") {
    const runId = `run_${uuidv7()}`;
    const sessionId = `sess_${uuidv7().slice(0, 8)}`;
    const agents = ["retriever", "summarizer", "writer"];
    agents.forEach((agentName, i) =>
      makeTrace(c, {
        startedAgo: 120_000 - i * 30_000,
        agentName,
        workflowName: "nightly-digest",
        workflowRunId: runId,
        sessionId,
        models: [pick(models)],
        metadata: { env: "test", scenario: "workflow", step: String(i + 1) },
      }),
    );
  } else if (kind === "tool") {
    makeTrace(c, {
      startedAgo: rnd(5_000, 60_000),
      agentName: "researcher",
      models: [pick(models), pick(models)],
      withTool: true,
      metadata: { env: "test", scenario: "tool" },
    });
  } else {
    // full: a spread of traces across agents, models, a workflow run, errors,
    // and the last ~30 minutes so the Overview charts have shape.
    const agents = ["support-bot", "researcher", "summarizer", "classifier"];
    const runId = `run_${uuidv7()}`;
    const sessionId = `sess_${uuidv7().slice(0, 8)}`;
    for (let i = 0; i < 18; i += 1) {
      const startedAgo = rnd(10_000, 30 * 60_000);
      const inWorkflow = i % 5 === 0;
      makeTrace(c, {
        startedAgo,
        agentName: pick(agents),
        workflowName: inWorkflow ? "nightly-digest" : undefined,
        workflowRunId: inWorkflow ? runId : undefined,
        sessionId: inWorkflow ? sessionId : undefined,
        models: Array.from({ length: rnd(1, 4) }, () => pick(models)),
        withTool: i % 4 === 0,
        error: i % 9 === 0,
        metadata: { env: "test", scenario: "full" },
      });
    }
  }

  const traceIds = new Set(c.rows.map((r) => r.trace_id));
  return { rows: c.rows, traces: traceIds.size, spans: c.rows.length };
}

/** Generate + insert synthetic spans for a project. */
export async function ingestTest(
  ch: Ch,
  db: Parameters<typeof requireProjectAccess>[0],
  userId: string,
  input: { projectId: string; kind: TestKind },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const table = await getPricingTable();
  const { rows, traces, spans } = buildRows(input.projectId, input.kind, table);
  await insertSpans(ch, rows);
  return { kind: input.kind, traces, spans };
}

export type PricedModelRow = {
  id: string;
  prompt: string | null;
  completion: string | null;
  request: string | null;
  cacheRead: string | null;
  cacheWrite: string | null;
};

/**
 * The OpenRouter pricing currently cached in-process — the same table ingest
 * uses to price spans. Per-token prices for the common dimensions.
 */
export async function listPricing(): Promise<{
  count: number;
  models: PricedModelRow[];
}> {
  const table = await getPricingTable();
  const models: PricedModelRow[] = [];
  for (const [id, price] of table.entries()) {
    models.push({
      id,
      prompt: price.prompt,
      completion: price.completion,
      request: price.request,
      cacheRead: price.cacheRead,
      cacheWrite: price.cacheWrite,
    });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return { count: models.length, models };
}
