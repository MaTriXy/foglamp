import {
  queryClickHouseDisks,
  queryClickHouseTableStats,
  queryPlatformErrorsByDay,
  queryPlatformTopOrgs,
  queryPlatformUsageByDay,
  queryRecentlyActiveOrgs,
} from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { subscription } from "@foglamp/db/schema/subscription";
import { env } from "@foglamp/env/server";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import Stripe from "stripe";

import { createLogger } from "evlog";

import { ymd } from "../lib/util";
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

const log = createLogger();

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"];

let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

/**
 * MRR in cents, summed from live Stripe subscriptions (amounts live in Stripe,
 * not our subscription mirror). Only items on our configured price IDs count,
 * so unrelated products in the same Stripe account can't skew the number.
 * Annual prices are normalized to per-month. Null when billing is disabled or
 * Stripe is unreachable — the page shows "—" rather than a fake zero.
 */
async function getMrrCents(): Promise<number | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const ourPriceIds = new Set(
    [env.STRIPE_PRICE_ID_PRO_MONTHLY, env.STRIPE_PRICE_ID_PRO_ANNUAL].filter(
      Boolean,
    ),
  );
  if (ourPriceIds.size === 0) return null;
  try {
    let total = 0;
    for await (const sub of stripe.subscriptions.list({
      status: "active",
      limit: 100,
    })) {
      for (const item of sub.items.data) {
        const price = item.price;
        if (!price?.unit_amount || !price.recurring) continue;
        if (!ourPriceIds.has(price.id)) continue;
        const amount = price.unit_amount * (item.quantity ?? 1);
        const { interval, interval_count: n } = price.recurring;
        const months =
          interval === "year"
            ? 12 * n
            : interval === "month"
              ? n
              : interval === "week"
                ? (7 * n) / 30
                : n / 30;
        total += amount / months;
      }
    }
    return Math.round(total);
  } catch (err) {
    log.error("platform.stripe_mrr_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Postgres database size + heaviest tables (pg catalog; no GCP API needed). */
async function getPostgresStats(db: Db) {
  const [sizeRows, tableRows] = await Promise.all([
    db.execute(
      sql`SELECT pg_database_size(current_database()) AS bytes`,
    ) as Promise<{ rows: { bytes: string }[] }>,
    db.execute(sql`
      SELECT c.relname AS table, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY bytes DESC
      LIMIT 8
    `) as Promise<{ rows: { table: string; bytes: string }[] }>,
  ]);
  return {
    totalBytes: Number(sizeRows.rows[0]?.bytes ?? 0),
    tables: tableRows.rows.map((r) => ({
      table: r.table,
      bytes: Number(r.bytes),
    })),
  };
}

// min() collapses the (rare) multi-owner case to one deterministic email.
const ownerEmail = sql<string | null>`min(${user.email})`;

/** Org lookup for the access-grant UI (name or slug, case-insensitive). */
export async function searchOrgs(db: Db, query: string) {
  const pattern = `%${query}%`;
  return db
    .select({
      id: organization.id,
      name: organization.name,
      ownerEmail,
      planOverride: organization.planOverride,
      overrideExpiresAt: organization.overrideExpiresAt,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.role, "owner"),
      ),
    )
    .leftJoin(user, eq(user.id, member.userId))
    .where(
      or(
        ilike(organization.name, pattern),
        ilike(organization.slug, pattern),
        ilike(user.email, pattern),
      ),
    )
    .groupBy(organization.id)
    .limit(10);
}

/** All orgs with a plan override, live or lapsed (the UI labels expired ones). */
export async function listAccessGrants(db: Db) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      ownerEmail,
      planOverride: organization.planOverride,
      overrideExpiresAt: organization.overrideExpiresAt,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.role, "owner"),
      ),
    )
    .leftJoin(user, eq(user.id, member.userId))
    .where(isNotNull(organization.planOverride))
    .groupBy(organization.id)
    .orderBy(desc(organization.createdAt));
}

/**
 * Comp an org up to enterprise limits (unlimited spans/projects/alerts/evals,
 * 90d retention), optionally time-boxed. Expiry is enforced at read time in
 * getOrgPlan, so the grant lapses on its own. Ingest caches plans for ~60s,
 * so grants/revocations take effect within a minute.
 */
export async function grantOrgAccess(
  db: Db,
  params: { orgId: string; days: number | null },
) {
  const overrideExpiresAt = params.days
    ? new Date(Date.now() + params.days * 86_400_000)
    : null;
  // limitsOverride is left untouched so a sales-led custom-limits org keeps
  // its negotiated levers if we extend its grant.
  await db
    .update(organization)
    .set({ planOverride: "comp", overrideExpiresAt })
    .where(eq(organization.id, params.orgId));
}

export async function revokeOrgAccess(db: Db, orgId: string) {
  await db
    .update(organization)
    .set({ planOverride: null, limitsOverride: null, overrideExpiresAt: null })
    .where(eq(organization.id, orgId));
}

/** Cross-org platform snapshot for the operator dashboard. */
export async function getPlatformStats(db: Db, ch: Ch) {
  const now = Date.now();
  const since7d = new Date(now - 7 * 86_400_000);
  const since30d = new Date(now - 30 * 86_400_000);

  const [
    [
      userRows,
      users7dRows,
      orgRows,
      projectRows,
      memberRows,
      subRows,
      orgsWithProjectsRows,
      planRows,
      signupRows,
    ],
    usageByDay,
    errorsByDay,
    topOrgRows,
    chTables,
    chDisks,
    activeOrgIds30d,
    mrrCents,
    postgres,
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
      db.select({ n: countDistinct(project.orgId) }).from(project),
      db
        .select({ plan: subscription.plan, n: count() })
        .from(subscription)
        .where(inArray(subscription.status, ACTIVE_SUB_STATUSES))
        .groupBy(subscription.plan),
      db
        .select({
          day: sql<string>`to_char(${user.createdAt}, 'YYYY-MM-DD')`,
          n: count(),
        })
        .from(user)
        .where(gte(user.createdAt, since30d))
        .groupBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`),
    ]),
    queryPlatformUsageByDay(ch, ymd(since30d)),
    queryPlatformErrorsByDay(ch, ymd(since30d)),
    queryPlatformTopOrgs(ch, ymd(since30d), 10),
    queryClickHouseTableStats(ch),
    queryClickHouseDisks(ch),
    queryRecentlyActiveOrgs(ch, ymd(since30d)),
    getMrrCents(),
    getPostgresStats(db),
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

  const totalOrgs = orgRows[0]?.n ?? 0;
  const paidOrgs = subRows[0]?.n ?? 0;
  const errorByDayMap = new Map(
    errorsByDay.map((r) => [
      r.day,
      { spans: Number(r.span_count), errors: Number(r.error_count) },
    ]),
  );
  return {
    totals: {
      users: userRows[0]?.n ?? 0,
      usersLast7d: users7dRows[0]?.n ?? 0,
      orgs: totalOrgs,
      projects: projectRows[0]?.n ?? 0,
      memberships: memberRows[0]?.n ?? 0,
      activeSubscriptions: paidOrgs,
    },
    // Null when billing is off / Stripe unreachable.
    mrrCents,
    // Active paid plans by name + the implied free remainder.
    plans: [
      ...planRows.map((r) => ({ plan: r.plan, orgs: r.n })),
      { plan: "free", orgs: Math.max(0, totalOrgs - paidOrgs) },
    ],
    // Signup → created a project → sent spans (30d) → paying.
    funnel: {
      users: userRows[0]?.n ?? 0,
      orgsWithProjects: orgsWithProjectsRows[0]?.n ?? 0,
      orgsActive30d: activeOrgIds30d.length,
      paidOrgs,
    },
    spans: { last24h: spans24h, last30d: spans30d },
    signupsByDay: signupRows.map((r) => ({ day: r.day, users: r.n })),
    usageByDay: usageByDay.map((r) => {
      const err = errorByDayMap.get(r.day);
      return {
        day: r.day,
        spans: Number(r.span_count),
        activeOrgs: Number(r.active_orgs),
        errors: err?.errors ?? 0,
        errorRate: err && err.spans > 0 ? err.errors / err.spans : 0,
      };
    }),
    topOrgs: topOrgRows.map((r) => ({
      orgId: r.org_id,
      name: nameById.get(r.org_id) ?? r.org_id,
      spans: Number(r.span_count),
    })),
    postgres,
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
