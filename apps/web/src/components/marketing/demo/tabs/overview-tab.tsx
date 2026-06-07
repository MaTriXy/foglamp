"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";

import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as LineChart from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { PageHeader, StatCard } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import {
  AGENT_ROWS,
  COST_SERIES,
  KPIS,
  LATENCY_SERIES,
  MODEL_ROWS,
  TRACE_ROWS,
} from "../mock-data";
import { DemoRangePill } from "../demo-chrome";

const themed = (color: string) => ({ light: [color], dark: [color] });

const costConfig = {
  "gpt-4o": { label: "gpt-4o", colors: themed("var(--chart-1)") },
  "claude-sonnet": { label: "claude-sonnet", colors: themed("var(--chart-2)") },
  "gpt-4o-mini": { label: "gpt-4o-mini", colors: themed("var(--chart-3)") },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("var(--chart-1)") },
  p99: { label: "p99", colors: themed("var(--chart-3)") },
} satisfies ChartConfig;

export function OverviewTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Cost, reliability, latency, and usage across this project."
        actions={<DemoRangePill />}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {KPIS.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            deltaInverted={kpi.deltaInverted}
            hint={kpi.hint}
          />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Cost over time</CardTitle>
          <CardDescription>Spend per hour, stacked by model.</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart.EvilAreaChart
            config={costConfig}
            data={COST_SERIES}
            xDataKey="label"
            stackType="stacked"
            curveType="monotone"
            className="h-[240px] w-full"
          >
            <AreaChart.Grid />
            <AreaChart.XAxis dataKey="label" />
            <AreaChart.Tooltip />
            <AreaChart.Area dataKey="gpt-4o" />
            <AreaChart.Area dataKey="claude-sonnet" />
            <AreaChart.Area dataKey="gpt-4o-mini" />
            <AreaChart.Legend />
          </AreaChart.EvilAreaChart>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latency</CardTitle>
            <CardDescription>p50 / p95 / p99 per hour (ms).</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart.EvilLineChart
              config={latencyConfig}
              data={LATENCY_SERIES}
              xDataKey="label"
              curveType="monotone"
              className="h-[240px] w-full"
            >
              <LineChart.Grid />
              <LineChart.XAxis dataKey="label" />
              <LineChart.Tooltip />
              <LineChart.Line dataKey="p50" />
              <LineChart.Line dataKey="p95" />
              <LineChart.Line dataKey="p99" />
            </LineChart.EvilLineChart>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By model</CardTitle>
            <CardDescription>Spend, usage, and latency per model.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODEL_ROWS.map((m) => (
                  <TableRow key={m.modelId}>
                    <TableCell className="font-mono text-xs">{m.modelId}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.requests}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.tokens}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.p95}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{m.cost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By agent</CardTitle>
            <CardDescription>Spend, errors, and latency per agent.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AGENT_ROWS.map((a) => (
                  <TableRow
                    key={a.agentName}
                    interactive
                    onClick={() => openDetail({ type: "agent", id: a.agentName })}
                  >
                    <TableCell className="truncate font-medium">{a.agentName}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.requests}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.errors}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.p95}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{a.cost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <CardTitle className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live feed
          </CardTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trace</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRACE_ROWS.slice(0, 4).map((t) => (
                <TableRow
                  key={t.traceId}
                  interactive
                  onClick={() => openDetail({ type: "trace", id: t.traceId })}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{t.name}</span>
                      {t.errors ? <Badge variant="rose">{t.errors} err</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.tokens}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{t.cost}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{t.when}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
