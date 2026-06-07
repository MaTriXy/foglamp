"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { IconGhostFilled } from "@tabler/icons-react";

import { PageHeader } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import { AGENTS } from "../mock-data";

export function AgentsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Agents"
        description="Every agentName seen in the last 24 hours, with its spend and health."
      />
      <section className="grid gap-4 md:grid-cols-2">
        {AGENTS.map((a) => (
          <Card
            key={a.name}
            onClick={() => openDetail({ type: "agent", id: a.name })}
            className="cursor-pointer transition-colors hover:bg-accent/40"
          >
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-xl corner-squircle bg-orange-100 p-0.5 text-orange-500 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.14)] dark:bg-orange-950 dark:shadow-(--custom-shadow)">
                  <IconGhostFilled className="size-4" />
                </span>
                <CardTitle className="truncate">{a.name}</CardTitle>
                <div className="ml-auto flex gap-1">
                  {a.models.map((m) => (
                    <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
              <CardDescription>
                {a.requests} requests · {a.errorRate} errors
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="p95" value={a.p95} />
              <Stat label="Cost" value={a.cost} />
              <Stat label="Eval pass" value={a.passRate} />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
