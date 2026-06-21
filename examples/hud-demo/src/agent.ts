// A self-contained multi-step agent run that showcases the Foglamp HUD: it looks
// up an order, tries to refund it (the refund FAILS the first time — the HUD
// flashes that step red), retries successfully, then emails a receipt. No API
// key required — it uses a deterministic mock model so the whole thing runs
// offline. In a real app you'd delete all of this and just keep the two lines:
// `foglamp({ hud: true })` + `<FoglampHUD />`.

import { foglamp } from "foglamp";
import { generateText, stepCountIs, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// HUD on, no ingest key needed — traces stream to the local overlay only.
const fog = foglamp({ hud: true });

function usage(inTok: number, outTok: number) {
  return {
    inputTokens: { total: inTok, noCache: inTok, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outTok, text: outTok, reasoning: 0 },
  };
}

// The model's scripted move at each step: a tool to call, or null = answer.
const SCRIPT: Array<{ toolName: string; input: unknown } | null> = [
  { toolName: "lookup_order", input: { orderId: "o_8842" } },
  { toolName: "issue_refund", input: { orderId: "o_8842" } },
  { toolName: "issue_refund", input: { orderId: "o_8842", retry: true } },
  { toolName: "send_email", input: { to: "alex@acme.com" } },
  null,
];

function model() {
  let step = 0;
  return new MockLanguageModelV4({
    provider: "openai",
    modelId: "gpt-5.4-pro",
    doGenerate: async () => {
      const move = SCRIPT[Math.min(step, SCRIPT.length - 1)];
      step += 1;
      await sleep(450); // "thinking" time so the HUD reads as live
      if (move) {
        return {
          content: [
            { type: "tool-call" as const, toolCallId: `c_${step}`, toolName: move.toolName, input: JSON.stringify(move.input) },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage: usage(900 + step * 180, 18),
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: "Done — your refund is issued and a receipt is on its way ✅" }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: usage(1680, 64),
        warnings: [],
      };
    },
  });
}

const tools = {
  lookup_order: tool({
    description: "Look up an order by id",
    inputSchema: z.object({ orderId: z.string() }),
    execute: async () => {
      await sleep(260);
      return { status: "found", total: 42.0, currency: "USD" };
    },
  }),
  issue_refund: tool({
    description: "Issue a refund for an order",
    inputSchema: z.object({ orderId: z.string(), retry: z.boolean().optional() }),
    execute: async ({ retry }) => {
      await sleep(320);
      // First attempt fails — this is the red-flash beat in the HUD.
      if (!retry) throw new Error("card_expired");
      return { refunded: true, amount: 42.0 };
    },
  }),
  send_email: tool({
    description: "Email the customer",
    inputSchema: z.object({ to: z.string() }),
    execute: async () => {
      await sleep(240);
      return { sent: true };
    },
  }),
};

/** Run the scripted support-copilot agent once. Streams live to the HUD. */
export async function runDemoAgent(): Promise<void> {
  await generateText({
    model: model(),
    tools,
    stopWhen: stepCountIs(8),
    prompt: "Refund my last order and email me the receipt.",
    telemetry: {
      integrations: [fog.integration({ agentName: "support-copilot", sessionId: "sess_demo" })],
    },
  });
}
