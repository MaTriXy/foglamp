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

import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { navItem } from "@/components/app/nav";
import { StatCard } from "@/components/app/page-parts";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVAL_DISTRIBUTION, EVAL_SAMPLES, EVALS } from "../mock-data";

const distConfig = {
  count: { label: "Traces", colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
} satisfies ChartConfig;

export function EvalDetail({ evalId }: { evalId: string }) {
  const { closeDetail } = useDemo();
  const e = EVALS.find((x) => x.id === evalId) ?? EVALS[0]!;
  const evalsNav = navItem("/evals")!;

  return (
    <>
      <DetailHeader
        backIcon={evalsNav.icon}
        backLabel="Evals"
        backIconClassName={evalsNav.iconClassName}
        title={e.name}
        description={e.type === "code" ? "Code check" : "LLM judge"}
        onBack={closeDetail}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scored" value={e.scored} hint="last 24h" />
        <StatCard label="Pass rate" value={`${Math.round(e.passRate * 100)}%`} />
        <StatCard label="Avg score" value={e.avgScore.toFixed(2)} />
        <StatCard
          label="Type"
          value={e.type === "code" ? "Code" : "LLM judge"}
          hint={e.type === "code" ? "deterministic" : "model-graded"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Score distribution</CardTitle>
          <CardDescription>Count of scored traces per 0–1 bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart.EvilBarChart
            config={distConfig}
            data={EVAL_DISTRIBUTION}
            xDataKey="bucket"
            className="h-[220px] w-full"
          >
            <BarChart.Grid />
            <BarChart.XAxis dataKey="bucket" />
            <BarChart.Tooltip />
            <BarChart.Bar dataKey="count" />
          </BarChart.EvilBarChart>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent samples</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trace</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVAL_SAMPLES.map((s) => (
                <TableRow key={s.traceId}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {s.traceId}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {s.score.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.verdict === "pass" ? "emerald" : "rose"}>
                      {s.verdict}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {s.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
