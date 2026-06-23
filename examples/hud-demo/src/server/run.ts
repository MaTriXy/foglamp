// Server-side mock agent runs. Each "agent" is a deterministic MockLanguageModel
// driving real `generateText` tool loops, instrumented with foglamp telemetry —
// so the HUD shows genuine steps/tool-calls/tokens without any API key. In a
// real app you delete all of this and keep `foglamp({ hud: true })` + the two
// lines that attach `fog.integration(...)` to your calls.

import { foglamp } from "foglamp";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import { AGENTS, type AgentMeta } from "../agents";

// HUD on, on a separate port from the dashboard dogfood (8517) so the two can
// run side by side. Constructing this starts the local broker.
const fog = foglamp({ hud: true, hudPort: 8518 });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));
const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});

type Move = { tool: string; input: unknown } | null;

function model(meta: AgentMeta, script: Move[]) {
  let step = 0;
  return new MockLanguageModelV4({
    provider: meta.provider,
    modelId: meta.model,
    doGenerate: async () => {
      const move = script[Math.min(step, script.length - 1)];
      step += 1;
      await sleep(rand(900, 2200)); // "thinking" so the HUD reads as live
      if (move) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: `c${step}`,
              toolName: move.tool,
              input: JSON.stringify(move.input),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage: usage(rand(700, 1400), rand(12, 30)),
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: "Done." }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: usage(rand(1400, 2200), rand(40, 90)),
        warnings: [],
      };
    },
  });
}

// Generic tools that just succeed after a beat; optionally one throws once.
function buildTools(names: string[], failTool?: string): ToolSet {
  const tools: ToolSet = {};
  let failed = false;
  names.forEach((name, i) => {
    tools[name] = tool({
      description: name,
      inputSchema: z.object({}).loose(),
      execute: async () => {
        await sleep(rand(700, 1700));
        if (name === failTool && !failed) {
          failed = true;
          throw new Error("upstream_unavailable");
        }
        return { ok: true, step: i };
      },
    });
  });
  return tools;
}

/** One run of an agent, streamed live to the HUD. */
export async function runAgent(id: string): Promise<void> {
  const meta = AGENTS.find((a) => a.id === id);
  if (!meta) return;

  let script: Move[];
  let tools: ToolSet;

  if (meta.id === "support") {
    // The storyboard: lookup → refund FAILS → refund retry succeeds → email.
    script = [
      { tool: "lookup_order", input: { orderId: "o_8842" } },
      { tool: "issue_refund", input: { orderId: "o_8842" } },
      { tool: "issue_refund", input: { orderId: "o_8842", retry: true } },
      { tool: "send_email", input: { to: "alex@acme.com" } },
      null,
    ];
    let firstRefund = true;
    tools = {
      lookup_order: tool({
        description: "Look up an order",
        inputSchema: z.object({}).loose(),
        execute: async () => {
          await sleep(rand(700, 1300));
          return { status: "found", total: 42 };
        },
      }),
      issue_refund: tool({
        description: "Issue a refund",
        inputSchema: z.object({}).loose(),
        execute: async () => {
          await sleep(rand(900, 1600));
          if (firstRefund) {
            firstRefund = false;
            throw new Error("card_expired");
          }
          return { refunded: true, amount: 42 };
        },
      }),
      send_email: tool({
        description: "Email the customer",
        inputSchema: z.object({}).loose(),
        execute: async () => {
          await sleep(rand(600, 1200));
          return { sent: true };
        },
      }),
    };
  } else {
    script = [...meta.tools.map((t) => ({ tool: t, input: { q: meta.name } })), null];
    const fail =
      meta.id === "triage" && Math.random() < 0.5
        ? meta.tools[meta.tools.length - 1]
        : undefined;
    tools = buildTools(meta.tools, fail);
  }

  await generateText({
    model: model(meta, script),
    tools,
    stopWhen: stepCountIs(script.length + 2),
    prompt: `Run ${meta.name}.`,
    telemetry: {
      integrations: [fog.integration({ agentName: meta.name, sessionId: `sess_${id}` })],
    },
  }).catch(() => {
    /* errored runs still surface in the HUD via onError */
  });
}

/**
 * Fire runs across the session, mostly separated in time with only two
 * deliberate overlapping pairs (analyst+reviewer, triage+analyst) — so the
 * timeline reads cleanly and clustering only kicks in a couple of times.
 */
export function runStorm(): void {
  const plan: Array<[string, number]> = [
    ["support", 0],
    ["analyst", 16_000],
    ["reviewer", 18_500], // overlaps analyst
    ["sql", 34_000],
    ["researcher", 48_000],
    ["triage", 64_000],
    ["analyst", 66_000], // overlaps triage
    ["sql", 82_000],
  ];
  for (const [id, delay] of plan) setTimeout(() => void runAgent(id), delay);
}
