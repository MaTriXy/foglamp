"use client";

import { useCallback, useEffect, useReducer, useState } from "react";

import type { HudEvent } from "../events";
import { initialState, reduce, type HudState } from "./model";

export type ConnStatus = "connecting" | "open" | "closed";

/**
 * Subscribe to the local HUD broker over SSE and fold the event stream into the
 * live model. EventSource auto-reconnects; on reconnect the broker replays its
 * ring buffer, and the reducer's upserts + `trace.end` span-snap make the replay
 * idempotent. `clear` resets the session view (the list's trash button).
 */
export function useHudStream(
  port: number,
  url?: string,
): {
  state: HudState;
  conn: ConnStatus;
  clear: () => void;
} {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    // Default to the dev-only loopback broker; `url` overrides it for a hosted
    // demo where the stream is proxied onto the page's own origin.
    const src = url ?? `http://127.0.0.1:${port}/events`;
    const es = new EventSource(src);
    es.onopen = () => setConn("open");
    es.onmessage = (e) => {
      try {
        dispatch(JSON.parse(e.data) as HudEvent);
      } catch {
        // ignore malformed frame
      }
    };
    es.onerror = () => setConn("connecting"); // EventSource retries on its own
    return () => {
      es.close();
      setConn("closed");
    };
  }, [port, url]);

  return { state, conn, clear };
}
