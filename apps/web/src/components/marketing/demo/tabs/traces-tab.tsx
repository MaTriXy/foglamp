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
import { IconAlertTriangle, IconGhost } from "@tabler/icons-react";

import { PageHeader } from "@/components/app/page-parts";

import { useDemo } from "../demo-context";
import {
  DemoFilter,
  DemoRangePill,
  DemoSearch,
  DemoToggle,
  DemoToolbar,
} from "../demo-chrome";
import { TRACE_ROWS } from "../mock-data";

export function TracesTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Traces"
        description="Each trace is one top-level generateText / streamText call."
      />

      <div className="flex flex-col gap-4">
        <DemoToolbar>
          <DemoSearch placeholder="Search trace name…" />
          <DemoFilter icon={IconGhost} label="Any agent" />
          <DemoToggle icon={IconAlertTriangle} label="Errors only" />
          <div className="ml-auto">
            <DemoRangePill />
          </div>
        </DemoToolbar>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-fit">Trace</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TRACE_ROWS.map((t) => (
              <TableRow
                key={t.traceId}
                interactive
                onClick={() => openDetail({ type: "trace", id: t.traceId })}
              >
                <TableCell className="w-fit font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {t.traceId}
                    {t.errors ? (
                      <Badge variant="rose" className="font-sans">
                        <IconAlertTriangle />
                        {t.errors} error
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell className="text-right tabular-nums">{t.spans}</TableCell>
                <TableCell className="text-right tabular-nums">{t.tokens}</TableCell>
                <TableCell className="text-right tabular-nums">{t.duration}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{t.cost}</TableCell>
                <TableCell className="text-right text-muted-foreground">{t.when}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
