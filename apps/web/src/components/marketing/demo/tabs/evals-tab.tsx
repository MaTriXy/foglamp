"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";

import { PageHeader } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import { EVALS } from "../mock-data";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function EvalsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Evals"
        description="Code checks and LLM judges scoring production traffic, 0–1."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Eval</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Scored</TableHead>
            <TableHead className="text-right">Pass rate</TableHead>
            <TableHead className="text-right">Avg score</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {EVALS.map((e) => (
            <TableRow
              key={e.id}
              interactive
              onClick={() => openDetail({ type: "eval", id: e.id })}
            >
              <TableCell className="font-medium">{e.name}</TableCell>
              <TableCell>
                <Badge variant={e.type === "code" ? "blue" : "violet"}>
                  {e.type === "code" ? "code" : "LLM judge"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{e.scored}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(e.passRate)}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium tabular-nums",
                  e.avgScore < 0.9 && "text-amber-600 dark:text-amber-500",
                )}
              >
                {e.avgScore.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{e.when}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
