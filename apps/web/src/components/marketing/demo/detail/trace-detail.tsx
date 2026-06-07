"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useState } from "react";

import { navItem } from "@/components/app/nav";
import { StatCard } from "@/components/app/page-parts";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { type TraceSpan } from "@/lib/trace-timeline";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { TRACE_MESSAGES, TRACE_ROWS, TRACE_SPANS } from "../mock-data";

const roleLabel: Record<string, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

// The demo trace shape matches the fields TraceTimeline reads (span tree,
// timing, tokens, cost); cast through `unknown` since the real type is deep
// tRPC inference.
const spans = TRACE_SPANS as unknown as TraceSpan[];

export function TraceDetail({ traceId }: { traceId: string }) {
  const { closeDetail } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const row = TRACE_ROWS.find((t) => t.traceId === traceId) ?? TRACE_ROWS[0]!;
  const tracesNav = navItem("/traces")!;

  return (
    <>
      <DetailHeader
        backIcon={tracesNav.icon}
        backLabel="Traces"
        backIconClassName={tracesNav.iconClassName}
        title={row.name}
        description={traceId}
        onBack={closeDetail}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Duration" value={row.duration} hint={`${row.spans} spans`} />
        <StatCard label="Tokens" value={row.tokens} hint="across all LLM spans" />
        <StatCard label="Cost" value={row.cost} hint="98% priced" />
        <StatCard
          label="Status"
          value={row.errors ? "Error" : "OK"}
          hint={row.errors ? `${row.errors} failed span` : "all spans succeeded"}
        />
      </section>

      {/* Waterfall + throughput replay — the real dashboard timeline component */}
      <TraceTimeline spans={spans} selected={selected} onSelect={setSelected} />

      {/* Prompt + response payload */}
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {TRACE_MESSAGES.map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {roleLabel[m.role]}
              </span>
              <p className="text-sm text-pretty">{m.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
