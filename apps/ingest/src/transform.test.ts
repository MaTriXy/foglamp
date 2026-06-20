import { describe, expect, test } from "bun:test";

import type { IngestPayload } from "@foglamp/contracts";

import { buildCustomerRows } from "./transform";

type Trace = IngestPayload["traces"][number];

// buildCustomerRows ignores spans entirely (it only reads trace.customer), but
// the payload type requires at least one — a minimal llm span keeps it typed.
const span = {
  spanId: "s1",
  spanType: "llm",
  name: "step",
  startTime: 0,
  endTime: 1,
  status: "ok",
} as Trace["spans"][number];

function payload(traces: Array<Omit<Trace, "spans">>): IngestPayload {
  return {
    version: "v1",
    traces: traces.map((t) => ({ ...t, spans: [span] })) as Trace[],
  };
}

describe("buildCustomerRows", () => {
  test("maps a trace's customer to a dimension row", () => {
    const rows = buildCustomerRows({
      payload: payload([
        {
          traceId: "t1",
          agentName: "a",
          customer: { id: "c1", name: "Acme", imageUrl: "https://x/a.png" },
        },
      ]),
      projectId: "p1",
      now: 1234,
    });
    expect(rows).toEqual([
      {
        project_id: "p1",
        customer_id: "c1",
        customer_name: "Acme",
        customer_image_url: "https://x/a.png",
        last_seen: 1234,
      },
    ]);
  });

  test("dedupes by customer_id — the latest occurrence in the batch wins", () => {
    const rows = buildCustomerRows({
      payload: payload([
        { traceId: "t1", agentName: "a", customer: { id: "c1", name: "Old" } },
        { traceId: "t2", agentName: "a", customer: { id: "c1", name: "New" } },
      ]),
      projectId: "p1",
      now: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.customer_name).toBe("New");
  });

  test("traces without a customer produce no rows", () => {
    const rows = buildCustomerRows({
      payload: payload([{ traceId: "t1", agentName: "a" }]),
      projectId: "p1",
      now: 1,
    });
    expect(rows).toEqual([]);
  });

  test("absent name/imageUrl default to empty strings", () => {
    const rows = buildCustomerRows({
      payload: payload([
        { traceId: "t1", agentName: "a", customer: { id: "c1" } },
      ]),
      projectId: "p1",
      now: 7,
    });
    expect(rows[0]).toEqual({
      project_id: "p1",
      customer_id: "c1",
      customer_name: "",
      customer_image_url: "",
      last_seen: 7,
    });
  });
});
