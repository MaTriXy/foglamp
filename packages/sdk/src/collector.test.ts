import { describe, expect, test } from "bun:test";

import { Collector } from "./collector";
import { resolveConfig } from "./config";
import type { Transport } from "./transport";
import type { Span, Trace } from "./wire";

// A Transport stub that just captures enqueued traces.
function makeCollector() {
  const traces: Trace[] = [];
  const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
  const config = resolveConfig({ apiKey: "fl_test", recordInputs: false, recordOutputs: true });
  const collector = new Collector(transport, config);
  return { collector, traces };
}

function llmSpan(trace: Trace): Span {
  const s = trace.spans.find((sp) => sp.spanType === "llm");
  if (!s) throw new Error("no llm span");
  return s;
}

describe("Collector model-call + provider signals", () => {
  test("modelCallMs is annotated; the span still covers the whole step", async () => {
    const { collector, traces } = makeCollector();
    const callId = "call-1";
    collector.onStart!({ callId, provider: "openai", modelId: "gpt-x" } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onLanguageModelCallStart!({ callId } as never);
    await Bun.sleep(15);
    collector.onLanguageModelCallEnd!({ callId } as never);
    // Simulate client-side tool time before the step closes.
    await Bun.sleep(15);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 5, outputTokens: 7 },
      finishReason: "stop",
    } as never);
    collector.onFinish!({ callId, text: "done" } as never);

    expect(traces.length).toBe(1);
    const span = llmSpan(traces[0]!);
    expect(span.modelCallMs).toBeGreaterThan(0);
    // The model-call window is shorter than the whole step (which includes tools).
    const stepMs = span.endTime - span.startTime;
    expect(span.modelCallMs!).toBeLessThanOrEqual(stepMs);
    expect(stepMs).toBeGreaterThanOrEqual(span.modelCallMs!);
  });

  test("system fingerprint, safety, sources, and rate-limit flow onto the span", () => {
    const { collector, traces } = makeCollector();
    const callId = "call-2";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: {
        openai: { systemFingerprint: "fp_test" },
        google: { safetyRatings: [{ category: "HARM_CATEGORY_HATE", probability: "LOW" }] },
      },
      sources: [{ sourceType: "url", url: "https://x.test", title: "X" }],
      response: {
        headers: {
          "x-ratelimit-remaining-tokens": "900",
          "x-ratelimit-limit-tokens": "1000",
        },
      },
    } as never);
    collector.onFinish!({ callId, text: "done" } as never);

    const span = llmSpan(traces[0]!);
    expect(span.systemFingerprint).toBe("fp_test");
    expect(span.safetyMetadata).toBeDefined();
    expect(JSON.parse(span.safetyMetadata!).google).toHaveLength(1);
    expect(span.sources).toBeDefined();
    expect(JSON.parse(span.sources!)[0].url).toBe("https://x.test");
    expect(span.rateLimit).toEqual({ tokensRemaining: 900, tokensLimit: 1000 });
  });

  test("sources are dropped when output capture is off", () => {
    const traces: Trace[] = [];
    const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
    const config = resolveConfig({ apiKey: "fl_test", recordOutputs: false });
    const collector = new Collector(transport, config);
    const callId = "call-3";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      sources: [{ sourceType: "url", url: "https://x.test" }],
    } as never);
    collector.onFinish!({ callId } as never);

    expect(llmSpan(traces[0]!).sources).toBeUndefined();
  });

  test("no model-call events → modelCallMs stays absent", () => {
    const { collector, traces } = makeCollector();
    const callId = "call-4";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    } as never);
    collector.onFinish!({ callId } as never);
    expect(llmSpan(traces[0]!).modelCallMs).toBeUndefined();
  });

  // generateObject/streamObject report their single step through the object-step
  // lifecycle, not onStepFinish — these must still produce an llm span carrying
  // usage and provider signals.
  test("object generation: onObjectStepFinish builds an llm span with usage + signals", () => {
    const { collector, traces } = makeCollector();
    const callId = "obj-1";
    collector.onStart!({ callId, provider: "openai", modelId: "gpt-4o" } as never);
    collector.onObjectStepStart!({
      callId,
      stepNumber: 0,
      promptMessages: [{ role: "user", content: "make an object" }],
    } as never);
    collector.onObjectStepFinish!({
      callId,
      stepNumber: 0,
      provider: "openai",
      modelId: "gpt-4o-2024-08-06",
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 7 },
      objectText: '{"a":1}',
      // streamObject reports TTFT via msToFirstChunk (no onChunk on this path).
      msToFirstChunk: 12,
      providerMetadata: {
        openai: { systemFingerprint: "fp_obj" },
        google: { safetyRatings: [{ category: "HARM_CATEGORY_HATE", probability: "LOW" }] },
      },
      response: {
        headers: {
          "x-ratelimit-remaining-tokens": "900",
          "x-ratelimit-limit-tokens": "1000",
        },
      },
    } as never);
    collector.onFinish!({ callId, object: { a: 1 } } as never);

    expect(traces.length).toBe(1);
    const trace = traces[0]!;
    const span = llmSpan(trace);
    expect(span.modelId).toBe("gpt-4o-2024-08-06");
    expect(span.usage?.outputTokens).toBe(7);
    expect(span.ttftMs).toBe(12);
    expect(span.systemFingerprint).toBe("fp_obj");
    expect(span.safetyMetadata).toBeDefined();
    expect(span.rateLimit).toEqual({ tokensRemaining: 900, tokensLimit: 1000 });
    expect(span.output).toBe('{"a":1}');
    // No language-model-call lifecycle on the object path → no modelCallMs.
    expect(span.modelCallMs).toBeUndefined();
    // The trace's root output is the parsed object reported at onFinish.
    const root = trace.spans.find((s) => s.spanType === "agent")!;
    expect(root.output).toBe('{"a":1}');
  });

  test("object generation: sources gated off / no signals → clean span", () => {
    const traces: Trace[] = [];
    const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
    const config = resolveConfig({ apiKey: "fl_test", recordOutputs: false });
    const collector = new Collector(transport, config);
    const callId = "obj-2";
    collector.onStart!({ callId } as never);
    collector.onObjectStepStart!({ callId, stepNumber: 0 } as never);
    collector.onObjectStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      objectText: '{"a":1}',
      sources: [{ sourceType: "url", url: "https://x.test" }],
    } as never);
    collector.onFinish!({ callId, object: { a: 1 } } as never);

    const span = llmSpan(traces[0]!);
    expect(span.sources).toBeUndefined();
    expect(span.output).toBeUndefined();
    expect(span.systemFingerprint).toBeUndefined();
    expect(span.rateLimit).toBeUndefined();
  });
});
