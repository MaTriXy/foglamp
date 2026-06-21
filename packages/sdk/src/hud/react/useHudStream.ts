"use client";

import { useEffect, useReducer, useState } from "react";

import type { HudEvent } from "../events";
import { initialState, reduce, type HudState } from "./model";

export type ConnStatus = "connecting" | "open" | "closed";

/**
 * Subscribe to the local HUD broker over SSE and fold the event stream into the
 * live model. EventSource auto-reconnects; on reconnect the broker replays its
 * ring buffer, and the reducer's upserts + `trace.end` span-snap make the replay
 * idempotent.
 */
export function useHudStream(port: number): { state: HudState; conn: ConnStatus } {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [conn, setConn] = useState<ConnStatus>("connecting");

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const url = `http://127.0.0.1:${port}/events`;
    const es = new EventSource(url);
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
  }, [port]);

  return { state, conn };
}
