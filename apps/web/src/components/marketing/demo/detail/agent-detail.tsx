"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  IconBolt,
  IconGhost,
  IconSparkles,
  IconTool,
} from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { NodeFlow, type FlowNode } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { AGENT_FLOW, AGENTS } from "../mock-data";

const stepIcon: Record<string, React.ReactNode> = {
  llm: <IconSparkles className="size-5 text-violet-500" />,
  tool: <IconTool className="size-5 text-blue-500" />,
  agent: <IconBolt className="size-5 text-amber-500" />,
};

export function AgentDetail({ agentName }: { agentName: string }) {
  const { closeDetail } = useDemo();
  const agent = AGENTS.find((a) => a.name === agentName) ?? AGENTS[0]!;
  const agentsNav = navItem("/agents")!;

  const nodes: FlowNode[] = AGENT_FLOW.map((s) => ({
    id: s.id,
    icon: stepIcon[s.type],
    label: s.label,
    sublabel: s.sublabel,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <>
      <DetailHeader
        backIcon={agentsNav.icon}
        backLabel="Agents"
        backIconClassName={agentsNav.iconClassName}
        title={agent.name}
        description={`${agent.requests} requests · ${agent.models.join(", ")}`}
        onBack={closeDetail}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Requests" value={agent.requests} hint={`${agent.errorRate} errors`} />
        <StatCard label="Latency p95" value={agent.p95} />
        <StatCard label="Cost" value={agent.cost} hint="last 24h" />
        <StatCard label="Eval pass rate" value={agent.passRate} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Typical call flow</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1.5">
              <IconGhost className="size-3.5" /> One representative run, step by step.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NodeFlow nodes={nodes} />
        </CardContent>
      </Card>
    </>
  );
}
