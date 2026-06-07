"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";

import { PageHeader } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import { WORKFLOWS } from "../mock-data";

export function WorkflowsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Multi-step runs that chain agents and tools end to end."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right">Steps</TableHead>
            <TableHead className="text-right">Error rate</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {WORKFLOWS.map((w) => (
            <TableRow
              key={w.name}
              interactive
              onClick={() => openDetail({ type: "workflow", id: w.name })}
            >
              <TableCell className="font-medium">{w.name}</TableCell>
              <TableCell className="text-right tabular-nums">{w.runs}</TableCell>
              <TableCell className="text-right tabular-nums">{w.steps}</TableCell>
              <TableCell className="text-right tabular-nums">{w.errorRate}</TableCell>
              <TableCell className="text-right tabular-nums">{w.p95}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{w.cost}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
