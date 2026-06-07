"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { IconBolt, IconTool } from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { NodeFlow, type FlowNode } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { WORKFLOW_FLOW, WORKFLOWS } from "../mock-data";

export function WorkflowDetail({ workflowName }: { workflowName: string }) {
  const { closeDetail } = useDemo();
  const wf = WORKFLOWS.find((w) => w.name === workflowName) ?? WORKFLOWS[0]!;
  const wfNav = navItem("/workflows")!;

  const nodes: FlowNode[] = WORKFLOW_FLOW.map((s) => ({
    id: s.id,
    icon:
      s.sublabel === "agent" ? (
        <IconBolt className="size-5 text-amber-500" />
      ) : (
        <IconTool className="size-5 text-blue-500" />
      ),
    label: s.label,
    sublabel: s.sublabel,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <>
      <DetailHeader
        backIcon={wfNav.icon}
        backLabel="Workflows"
        backIconClassName={wfNav.iconClassName}
        title={wf.name}
        description={`${wf.runs} runs · ${wf.steps} steps`}
        onBack={closeDetail}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Runs" value={wf.runs} hint={`${wf.errorRate} errors`} />
        <StatCard label="Steps" value={wf.steps} />
        <StatCard label="Latency p95" value={wf.p95} />
        <StatCard label="Cost" value={wf.cost} hint="last 24h" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Run flow</CardTitle>
        </CardHeader>
        <CardContent>
          <NodeFlow nodes={nodes} />
        </CardContent>
      </Card>
    </>
  );
}
