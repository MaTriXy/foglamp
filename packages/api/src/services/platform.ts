import {
  queryClickHouseDisks,
  queryClickHouseTableStats,
  queryPlatformTopOrgs,
  queryPlatformUsageByDay,
} from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { subscription } from "@foglamp/db/schema/subscription";
import { env } from "@foglamp/env/server";
import { count, gte, inArray } from "drizzle-orm";

import type { Ch, Db } from "../types";

/**
 * Hosted-operator allowlist. Platform stats are cross-org (every customer's
 * usage), so this is gated by operator email, not org role. Unset on
 * self-hosts → nobody, and the UI entry point stays hidden.
 */
export function isPlatformAdmin(email: string): boolean {
  const allow = (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"];

/** Cross-org platform snapshot for the operator dashboard. */
export async function getPlatformStats(db: Db, ch: Ch) {
  const now = Date.now();
  const since7d = new Date(now - 7 * 86_400_000);
  const since30d = new Date(now - 30 * 86_400_000);

  const [
    [userRows, users7dRows, orgRows, projectRows, memberRows, subRows],
    usageByDay,
    topOrgRows,
    chTables,
    chDisks,
  ] = await Promise.all([
    Promise.all([
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(user).where(gte(user.createdAt, since7d)),
      db.select({ n: count() }).from(organization),
      db.select({ n: count() }).from(project),
      db.select({ n: count() }).from(member),
      db
        .select({ n: count() })
        .from(subscription)
        .where(inArray(subscription.status, ACTIVE_SUB_STATUSES)),
    ]),
    queryPlatformUsageByDay(ch, ymd(since30d)),
    queryPlatformTopOrgs(ch, ymd(since30d), 10),
    queryClickHouseTableStats(ch),
    queryClickHouseDisks(ch),
  ]);

  // Resolve org names for the top-usage list (CH only has ids).
  const topOrgIds = topOrgRows.map((r) => r.org_id);
  const orgNames = topOrgIds.length
    ? await db
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(inArray(organization.id, topOrgIds))
    : [];
  const nameById = new Map(orgNames.map((o) => [o.id, o.name]));

  const spans30d = usageByDay.reduce((acc, r) => acc + Number(r.span_count), 0);
  const spans24h = usageByDay
    .filter((r) => r.day >= ymd(new Date(now - 86_400_000)))
    .reduce((acc, r) => acc + Number(r.span_count), 0);

  return {
    totals: {
      users: userRows[0]?.n ?? 0,
      usersLast7d: users7dRows[0]?.n ?? 0,
      orgs: orgRows[0]?.n ?? 0,
      projects: projectRows[0]?.n ?? 0,
      memberships: memberRows[0]?.n ?? 0,
      activeSubscriptions: subRows[0]?.n ?? 0,
    },
    spans: { last24h: spans24h, last30d: spans30d },
    usageByDay: usageByDay.map((r) => ({
      day: r.day,
      spans: Number(r.span_count),
      activeOrgs: Number(r.active_orgs),
    })),
    topOrgs: topOrgRows.map((r) => ({
      orgId: r.org_id,
      name: nameById.get(r.org_id) ?? r.org_id,
      spans: Number(r.span_count),
    })),
    clickhouse: {
      tables: chTables.map((t) => ({
        table: t.table,
        rows: Number(t.row_count),
        bytes: Number(t.bytes_on_disk),
      })),
      disks: chDisks.map((d) => ({
        name: d.name,
        freeBytes: Number(d.free_space),
        totalBytes: Number(d.total_space),
      })),
    },
  };
}
