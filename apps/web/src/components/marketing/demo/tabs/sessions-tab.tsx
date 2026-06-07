"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { IconUser } from "@tabler/icons-react";

import { PageHeader } from "@/components/app/page-parts";

import { DemoFilter, DemoSearch, DemoToolbar } from "../demo-chrome";
import { SESSIONS } from "../mock-data";

export function SessionsTab() {
  return (
    <>
      <PageHeader
        title="Sessions"
        description="Conversations grouped by sessionId — every turn, token, and dollar."
      />
      <div className="flex flex-col gap-4">
        <DemoToolbar>
          <DemoSearch placeholder="Search user…" />
          <DemoFilter icon={IconUser} label="Any user" />
        </DemoToolbar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Turns</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SESSIONS.map((s) => (
              <TableRow key={s.sessionId}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {s.sessionId}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.user}</TableCell>
                <TableCell className="text-right tabular-nums">{s.turns}</TableCell>
                <TableCell className="text-right tabular-nums">{s.tokens}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{s.cost}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s.when}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
