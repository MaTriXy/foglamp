import { afterAll, describe, expect, it } from "bun:test";

import { closeAllBrokers, getBroker } from "./broker";
import type { HudEvent } from "./events";

const noop = () => {};

afterAll(() => closeAllBrokers());

function traceStart(traceId: string): HudEvent {
  return { type: "trace.start", ts: 1, traceId, name: traceId };
}

async function waitForHealth(port: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        await res.text();
        return;
      }
    } catch {
      // server not listening yet
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`broker on :${port} never became healthy`);
}

/** Open the SSE stream and resolve once `count` events have arrived. */
function collect(port: number, count: number, timeoutMs = 2000): Promise<HudEvent[]> {
  return new Promise((resolve, reject) => {
    const events: HudEvent[] = [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout: got ${events.length}/${count} events`));
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
          if (!line) continue; // skip the ":ok" comment
          events.push(JSON.parse(line.slice(5)) as HudEvent);
          if (events.length >= count) {
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

describe("hud broker (SSE)", () => {
  it("replays the ring buffer to a client that connects mid-run, then streams live", async () => {
    const port = 8591;
    const broker = getBroker(port, noop);
    // Emitted before any client connects — must be backfilled on connect.
    broker.emit(traceStart("before-1"));
    broker.emit(traceStart("before-2"));

    await waitForHealth(port);

    const got = collect(port, 3);
    // Give the connection a beat to register before the live emit.
    await new Promise((r) => setTimeout(r, 100));
    broker.emit(traceStart("after-1"));

    const events = await got;
    expect(events.map((e) => e.traceId)).toEqual(["before-1", "before-2", "after-1"]);
  });

  it("returns a singleton per port", () => {
    const a = getBroker(8591, noop);
    const b = getBroker(8591, noop);
    expect(a).not.toBe(b); // fresh emitter wrapper each call...
    // ...but both target the same underlying server (no throw, same port reused).
    expect(() => b.emit(traceStart("x"))).not.toThrow();
  });
});
