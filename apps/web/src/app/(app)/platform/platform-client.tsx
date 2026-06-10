"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app/page-parts";
import { formatCount } from "@/lib/format";
import { trpc } from "@/utils/trpc";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// Operator-only platform overview (gated server-side by PLATFORM_ADMIN_EMAILS;
// the stats query 403s for anyone else, so this page renders nothing useful
// even if reached directly).
export function PlatformClient() {
  const stats = useQuery({
    ...trpc.platform.stats.queryOptions(),
    refetchInterval: 60_000,
  });

  if (stats.error) {
    return (
      <>
        <PageHeader title="Platform" />
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to platform stats.
        </p>
      </>
    );
  }

  const d = stats.data;
  if (!d) {
    return (
      <>
        <PageHeader title="Platform" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Platform"
        description="Cross-org numbers for the hosted deployment. Refreshes every minute."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Users" value={formatCount(d.totals.users)} />
        <Stat label="New users (7d)" value={formatCount(d.totals.usersLast7d)} />
        <Stat label="Organizations" value={formatCount(d.totals.orgs)} />
        <Stat label="Projects" value={formatCount(d.totals.projects)} />
        <Stat
          label="Paid subscriptions"
          value={formatCount(d.totals.activeSubscriptions)}
        />
        <Stat label="Spans (24h)" value={formatCount(d.spans.last24h)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion, last 30 days</CardTitle>
            <CardDescription>
              {formatCount(d.spans.last30d)} spans total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Spans</th>
                  <th className="py-1 text-right font-medium">Active orgs</th>
                </tr>
              </thead>
              <tbody>
                {[...d.usageByDay].reverse().map((row) => (
                  <tr key={row.day} className="border-t border-border/50">
                    <td className="py-1 tabular-nums">{row.day}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(row.spans)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {row.activeOrgs}
                    </td>
                  </tr>
                ))}
                {d.usageByDay.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-3 text-center text-muted-foreground"
                    >
                      No usage yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top organizations, last 30 days</CardTitle>
            <CardDescription>By span volume</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {d.topOrgs.map((org) => (
                  <tr key={org.orgId} className="border-t border-border/50">
                    <td className="max-w-0 truncate py-1 pr-4">{org.name}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(org.spans)}
                    </td>
                  </tr>
                ))}
                {d.topOrgs.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-muted-foreground">
                      No usage yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ClickHouse storage</CardTitle>
            <CardDescription>Active parts per table</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Table</th>
                  <th className="py-1 text-right font-medium">Rows</th>
                  <th className="py-1 text-right font-medium">On disk</th>
                </tr>
              </thead>
              <tbody>
                {d.clickhouse.tables.map((t) => (
                  <tr key={t.table} className="border-t border-border/50">
                    <td className="py-1 font-mono text-xs">{t.table}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(t.rows)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatBytes(t.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ClickHouse disks</CardTitle>
            <CardDescription>
              Watch free space — the VM disk fills before anything else breaks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.clickhouse.disks.map((disk) => {
              const used = disk.totalBytes - disk.freeBytes;
              const pct = disk.totalBytes ? used / disk.totalBytes : 0;
              return (
                <div key={disk.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-mono text-xs">{disk.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBytes(used)} / {formatBytes(disk.totalBytes)} (
                      {Math.round(pct * 100)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-muted">
                    <div
                      className={`h-1.5 rounded ${pct > 0.85 ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, pct * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
