import { afterAll, expect, test } from "bun:test";

import { Collector } from "../collector";
import { resolveConfig } from "../config";
import type { Transport } from "../transport";
import { closeAllBrokers } from "./broker";
import type { HudEvent, HudEventType } from "./events";
import { seedPricingTable } from "./pricing";

// Seed the pricing table so the relay's warmPricing() short-circuits instead of
// hitting the network (which would also keep the test process alive). An empty
// table just means cost prices to "—".
seedPricingTable(new Map());

afterAll(() => closeAllBrokers());

async function waitForHealth(port: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        await res.text();
        return;
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`broker on :${port} never became healthy`);
}

/** Read the SSE stream until `trace.end` arrives (or timeout). */
function collectUntilTraceEnd(port: number, timeoutMs = 3000): Promise<HudEvent[]> {
  return new Promise((resolve, reject) => {
    const events: HudEvent[] = [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout: ${events.map((e) => e.type).join(",")}`));
    }, timeoutMs);
    (async () => {
      const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: ctrl.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5)) as HudEvent;
          events.push(event);
          if (event.type === "trace.end") {
            clearTimeout(timer);
            ctrl.abort();
            resolve(events);
            return;
          }
        }
      }
    })().catch((error) => {
      if (!ctrl.signal.aborted) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

test("streams the live event sequence for a step with a failing tool (no API key)", async () => {
  const port = 8593;
  // No apiKey: ingest is disabled but the HUD is on, so traces still build and
  // stream locally.
  const config = resolveConfig({ hud: true, hudPort: port, recordInputs: true, recordOutputs: true });
  expect(config.enabled).toBe(false);
  expect(config.active).toBe(true);
  expect(config.hud).toBe(true);

  const transport = { enqueue: () => {} } as unknown as Transport;
  const collector = new Collector(transport, config);

  const callId = "call-hud";
  collector.onStart!({ callId, provider: "openai", modelId: "gpt-x" } as never);
  collector.onStepStart!({ callId, stepNumber: 0 } as never);
  collector.onToolExecutionStart!({
    callId,
    toolCall: { toolCallId: "t1", toolName: "issue_refund", input: { orderId: "o_1" } },
  } as never);
  collector.onToolExecutionEnd!({
    callId,
    toolCall: { toolCallId: "t1", toolName: "issue_refund" },
    toolOutput: { type: "tool-error", error: "card_expired" },
  } as never);
  collector.onStepFinish!({
    callId,
    stepNumber: 0,
    usage: { inputTokens: 12, outputTokens: 34 },
    finishReason: "stop",
  } as never);
  collector.onFinish!({ callId, text: "done" } as never);

  await waitForHealth(port);
  const events = await collectUntilTraceEnd(port);
  const types = events.map((e) => e.type);

  // The full live arc, in order.
  const expectedOrder: HudEventType[] = [
    "trace.start",
    "step.start",
    "tool.start",
    "tool.end",
    "step.end",
    "trace.end",
  ];
  expect(types).toEqual(expectedOrder);

  const toolEnd = events.find((e) => e.type === "tool.end");
  expect(toolEnd).toMatchObject({ status: "error", errorMessage: "card_expired", toolName: "issue_refund" });

  const traceEnd = events.find((e) => e.type === "trace.end");
  if (traceEnd?.type !== "trace.end") throw new Error("missing trace.end");
  expect(traceEnd.totals.outputTokens).toBe(34);
  expect(traceEnd.totals.inputTokens).toBe(12);
  expect(traceEnd.trace.spans.some((s) => s.spanType === "tool")).toBe(true);
});
