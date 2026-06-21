import { describe, expect, test } from "bun:test";

import type { HudEvent } from "../events";
import type { Trace } from "../../wire";
import { initialState, reduce, rows, type HudState } from "./model";

function fold(events: HudEvent[]): HudState {
  return events.reduce(reduce, initialState);
}

const TRACE_ID = "call-1";

function finalizedTrace(): Trace {
  return {
    traceId: TRACE_ID,
    agentName: "support-copilot",
    spans: [
      { spanId: `${TRACE_ID}:root`, spanType: "agent", name: "support-copilot", startTime: 0, endTime: 300, status: "error" },
      {
        spanId: `${TRACE_ID}:step:0`,
        parentSpanId: `${TRACE_ID}:root`,
        spanType: "llm",
        name: "step 0",
        startTime: 0,
        endTime: 300,
        status: "ok",
        usage: { outputTokens: 34, inputTokens: 12 },
      },
      {
        spanId: `${TRACE_ID}:tool:t1`,
        parentSpanId: `${TRACE_ID}:root`,
        spanType: "tool",
        name: "issue_refund",
        startTime: 100,
        endTime: 220,
        status: "error",
        errorMessage: "card_expired",
      },
    ],
  };
}

describe("hud model reducer", () => {
  test("folds the live failing-tool sequence into one trace, snapping to spans at end", () => {
    const state = fold([
      { type: "trace.start", ts: 0, traceId: TRACE_ID, name: "support-copilot", agentName: "support-copilot", model: "gpt-x", toolCatalog: JSON.stringify({ lookup_order: {}, issue_refund: {} }) },
      { type: "step.start", ts: 1, traceId: TRACE_ID, stepNumber: 0 },
      { type: "step.firstToken", ts: 2, traceId: TRACE_ID, stepNumber: 0, ttftMs: 42 },
      { type: "tool.start", ts: 3, traceId: TRACE_ID, toolCallId: "t1", toolName: "issue_refund", input: "{}" },
      { type: "tool.end", ts: 4, traceId: TRACE_ID, toolCallId: "t1", toolName: "issue_refund", status: "error", errorMessage: "card_expired", durationMs: 120 },
      { type: "step.end", ts: 5, traceId: TRACE_ID, stepNumber: 0, status: "ok", usage: { outputTokens: 34, inputTokens: 12 }, durationMs: 300 },
      { type: "trace.end", ts: 6, traceId: TRACE_ID, status: "error", trace: finalizedTrace(), totals: { inputTokens: 12, outputTokens: 34, totalTokens: 46, durationMs: 300, costUsd: 0.0123 } },
    ]);

    expect(state.traces).toHaveLength(1);
    const trace = state.traces[0]!;
    expect(trace.status).toBe("error");
    expect(trace.agentName).toBe("support-copilot");
    expect(trace.toolNames).toEqual(["lookup_order", "issue_refund"]);
    expect(trace.totals?.costUsd).toBe(0.0123);

    // Snapped from authoritative spans.
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.outputTokens).toBe(34);
    expect(trace.tools).toHaveLength(1);
    expect(trace.tools[0]).toMatchObject({ toolName: "issue_refund", status: "error", errorMessage: "card_expired" });

    // Call-tree order: step before tool (by start time).
    const tree = rows(trace);
    expect(tree.map((r) => r.kind)).toEqual(["step", "tool"]);
  });

  test("step.tokens advances the live output estimate monotonically", () => {
    const state = fold([
      { type: "trace.start", ts: 0, traceId: TRACE_ID, name: "x" },
      { type: "step.start", ts: 1, traceId: TRACE_ID, stepNumber: 0 },
      { type: "step.tokens", ts: 2, traceId: TRACE_ID, stepNumber: 0, outputTokens: 10 },
      { type: "step.tokens", ts: 3, traceId: TRACE_ID, stepNumber: 0, outputTokens: 25 },
      { type: "step.tokens", ts: 4, traceId: TRACE_ID, stepNumber: 0, outputTokens: 20 }, // out-of-order, ignored
    ]);
    expect(state.traces[0]!.steps[0]!.outputTokens).toBe(25);
    expect(state.traces[0]!.status).toBe("running");
  });

  test("mints a stub trace when connecting mid-run (missed trace.start)", () => {
    const state = fold([
      { type: "tool.start", ts: 1, traceId: "orphan", toolCallId: "t9", toolName: "search" },
    ]);
    expect(state.traces).toHaveLength(1);
    expect(state.traces[0]!.traceId).toBe("orphan");
    expect(state.traces[0]!.tools[0]!.toolName).toBe("search");
  });
});
