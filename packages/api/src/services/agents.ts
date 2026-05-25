import {
  getTraceSpans,
  listTraces,
  queryAgentBreakdown,
} from "@foglamp/clickhouse";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

function quantiles(q: number[] | undefined) {
  return {
    p50: num(q?.[0]),
    p95: num(q?.[1]),
    p99: num(q?.[2]),
  };
}

export async function getAgentList(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryAgentBreakdown(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  return rows.map((r) => ({
    agentName: r.agent_name,
    spanCount: num(r.span_count),
    llmSpanCount: num(r.llm_span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
    latencyMs: quantiles(r.duration_quantiles),
  }));
}

/**
 * One agent's detail: windowed stats (mirrors the list), its recent traces (the
 * runs table), and the node graph for the latest trace — every step span except
 * the root `agent` span, in execution order (the SDK's LLM/tool steps).
 */
export async function getAgentDetail(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; agentName: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);

  const breakdown = await queryAgentBreakdown(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  const row = breakdown.find((r) => r.agent_name === input.agentName);
  const stats = row
    ? {
        spanCount: num(row.span_count),
        llmSpanCount: num(row.llm_span_count),
        errorCount: num(row.error_count),
        totalCost: decimalOrNull(row.total_cost),
        pricedSpanCount: num(row.priced_span_count),
        totalTokens: num(row.total_tokens),
        latencyMs: quantiles(row.duration_quantiles),
      }
    : null;

  // Recent traces for this agent (newest first); traces[0] feeds the node graph.
  const traceRows = await listTraces(ch, {
    projectId: input.projectId,
    agentName: input.agentName,
    limit: 50,
  });
  const traces = traceRows.map((r) => ({
    traceId: r.trace_id,
    workflowName: r.workflow_name || null,
    workflowRunId: r.workflow_run_id || null,
    startTime: r.trace_start,
    endTime: r.trace_end,
    durationMs: num(r.duration_ms),
    spanCount: num(r.span_count),
    llmSpanCount: num(r.llm_span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    totalTokens: num(r.total_tokens),
  }));

  const latest = traceRows[0];
  const spans = latest
    ? await getTraceSpans(ch, {
        projectId: input.projectId,
        traceId: latest.trace_id,
      })
    : [];
  const nodes = spans
    .filter((s) => s.span_type !== "agent")
    .map((s) => ({
      spanId: s.span_id,
      spanType: s.span_type,
      name: s.name,
      status: s.status,
      modelId: s.model_id || null,
      startTime: s.start_time,
      endTime: s.end_time,
      durationMs: num(s.duration_ms),
      totalCost: decimalOrNull(s.total_cost),
      totalTokens: num(s.total_tokens),
    }));

  return {
    agentName: input.agentName,
    stats,
    traces,
    latestTraceId: latest?.trace_id ?? null,
    nodes,
  };
}
