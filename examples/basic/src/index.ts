// Foglamp SDK — basic end-to-end example.
//
// Demonstrates the two-line integration: create a collector, attach it to a
// `generateText` call. Every step/tool becomes a span; the trace is flushed to
// your Foglamp ingest endpoint.
//
//   FOGLAMP_API_KEY=fl_…  FOGLAMP_INGEST_URL=http://localhost:4000/ingest \
//     bun run start
//
// With no OPENAI_API_KEY set it uses a deterministic mock model, so the whole
// pipeline runs offline. Set OPENAI_API_KEY to hit a real model instead — the
// instrumentation is identical either way.
import { openai } from "@ai-sdk/openai";
import { foglamp } from "foglamp";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const PROMPT = "In one sentence, what is Foglamp?";

// A real provider when a key is present; otherwise a stand-in that returns a
// fixed answer and token usage so the example produces a complete trace.
const model = process.env.OPENAI_API_KEY
  ? openai("gpt-4o-mini")
  : new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-4o-mini",
      doGenerate: async () => ({
        content: [
          {
            type: "text" as const,
            text: "Foglamp is the missing observability layer for the Vercel AI SDK.",
          },
        ],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: {
            total: 1240,
            noCache: 1040,
            cacheRead: 200,
            cacheWrite: 0,
          },
          outputTokens: { total: 84, text: 84, reasoning: 0 },
        },
        warnings: [],
      }),
    });

// 1. Create the collector. Reads FOGLAMP_API_KEY / FOGLAMP_INGEST_URL from
//    the environment. A no-op if no API key is set.
const wt = foglamp();

// 2. Attach it to the call with first-class context (agent/workflow/session).
const { text } = await generateText({
  model,
  prompt: PROMPT,
  telemetry: {
    integrations: [
      wt.integration({
        agentName: "support-bot",
        workflowName: "demo",
        sessionId: "sess_demo_1",
        metadata: { example: "basic", env: "local" },
      }),
    ],
  },
});

console.log(`> ${PROMPT}`);
console.log(`< ${text}`);

// Short-lived process: flush before exiting so the trace is sent. (Long-running
// servers flush on a timer; serverless flushes per-call via waitUntil.)
await wt.flush();
console.log(
  wt.pending === 0
    ? "✓ flushed trace to Foglamp"
    : `⚠ ${wt.pending} traces still pending`
);
