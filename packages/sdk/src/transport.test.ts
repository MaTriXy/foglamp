import { afterEach, describe, expect, test } from "bun:test";

import { resolveConfig } from "./config";
import { Transport } from "./transport";
import type { Trace } from "./wire";

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

function makeTrace(): Trace {
  const now = new Date().toISOString();
  return {
    traceId: "tr-1",
    traceName: "t",
    startedAt: now,
    endedAt: now,
    status: "ok",
    spans: [],
    metadata: {},
  } as unknown as Trace;
}

function makeCapture() {
  let sent = 0;
  const fetchImpl = (async () => {
    sent++;
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent: () => sent };
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
});

describe("transport serverless keep-alive", () => {
  test("registers the flush with Vercel's request-context waitUntil (no package needed)", async () => {
    const kept: Promise<unknown>[] = [];
    (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = {
      get: () => ({ waitUntil: (p: Promise<unknown>) => kept.push(p) }),
    };

    const { fetchImpl, sent } = makeCapture();
    const transport = new Transport(
      resolveConfig({ apiKey: "fl_test", fetch: fetchImpl, waitUntil: undefined, debug: false }),
    );
    // Force the serverless path regardless of the test machine's env.
    (transport as unknown as { config: { serverless: boolean } }).config.serverless = true;

    transport.enqueue(makeTrace());
    expect(kept).toHaveLength(1);
    await kept[0];
    expect(sent()).toBe(1);
  });

  test("an explicit config.waitUntil wins over the Vercel global", async () => {
    let globalUsed = false;
    (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = {
      get: () => ({
        waitUntil: () => {
          globalUsed = true;
        },
      }),
    };

    const kept: Promise<unknown>[] = [];
    const { fetchImpl } = makeCapture();
    const transport = new Transport(
      resolveConfig({
        apiKey: "fl_test",
        fetch: fetchImpl,
        waitUntil: (p) => kept.push(p),
      }),
    );

    transport.enqueue(makeTrace());
    expect(kept).toHaveLength(1);
    expect(globalUsed).toBe(false);
    await kept[0];
  });

  test("no waitUntil anywhere: flush still runs, nothing throws", async () => {
    const { fetchImpl, sent } = makeCapture();
    const transport = new Transport(
      resolveConfig({ apiKey: "fl_test", fetch: fetchImpl, waitUntil: undefined }),
    );
    (transport as unknown as { config: { serverless: boolean } }).config.serverless = true;

    transport.enqueue(makeTrace());
    await transport.shutdown();
    expect(sent()).toBe(1);
  });
});
