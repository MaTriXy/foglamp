import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, test } from "bun:test";

import { runMigrations, type MigrationProgress } from "./migrate";
import {
  LEGACY_MV_DROP_MIGRATION,
  MIGRATIONS,
  modifyMaterializedViewQuery,
} from "./migrations";

// A minimal in-memory stand-in for ClickHouseClient: `applied` plays the role
// of the schema_migrations table (query reads it, insert appends to it),
// `commands` records every DDL statement issued, and `throwOn` lets a test fail
// a chosen statement to exercise the resume-by-retry path. Only the three
// methods runMigrations touches are implemented. `throwOn` is mutable so a test
// can clear the fault and re-run against the same (partially-applied) state.
function makeFakeClient(throwOn?: (query: string) => boolean) {
  const applied = new Set<string>();
  const commands: string[] = [];
  const fake = {
    applied,
    commands,
    throwOn,
    async command({ query }: { query: string }): Promise<void> {
      if (fake.throwOn?.(query)) throw new Error(`clickhouse refused: ${query.slice(0, 40)}`);
      commands.push(query);
    },
    async query(_args: { query: string; format?: string }) {
      const rows = [...applied].map((id) => ({ id }));
      return {
        async json<T>(): Promise<T[]> {
          return rows as T[];
        },
      };
    },
    async insert({ values }: { values: { id: string }[] }): Promise<void> {
      for (const v of values) applied.add(v.id);
    },
  };
  return fake;
}

type FakeClient = ReturnType<typeof makeFakeClient>;
const asClient = (f: FakeClient) => f as unknown as ClickHouseClient;

describe("runMigrations", () => {
  test("applies every migration in order on a fresh database", async () => {
    const fake = makeFakeClient();
    const applied = await runMigrations(asClient(fake));
    expect(applied).toEqual(MIGRATIONS.map((m) => m.id));
    expect(fake.applied).toEqual(new Set(MIGRATIONS.map((m) => m.id)));
  });

  test("is a no-op on an already-migrated database", async () => {
    const fake = makeFakeClient();
    await runMigrations(asClient(fake));
    const commandsAfterFirst = fake.commands.length;

    const events: MigrationProgress[] = [];
    const applied = await runMigrations(asClient(fake), {
      onProgress: (e) => events.push(e),
    });
    expect(applied).toEqual([]);
    expect(events).toEqual([]);
    // Second run still ensures the migrations table, but issues no migration DDL.
    expect(fake.commands.length).toBe(commandsAfterFirst + 1);
  });

  test("reports progress for each pending migration", async () => {
    const fake = makeFakeClient();
    const events: MigrationProgress[] = [];
    await runMigrations(asClient(fake), { onProgress: (e) => events.push(e) });

    const starts = events.filter((e) => e.phase === "start");
    const dones = events.filter((e) => e.phase === "done");
    expect(starts.map((e) => e.id)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(dones.map((e) => e.id)).toEqual(MIGRATIONS.map((m) => m.id));
    // index runs 0..n-1 and total is the pending count (all of them, here).
    expect(starts.map((e) => e.index)).toEqual(MIGRATIONS.map((_, i) => i));
    expect(events.every((e) => e.total === MIGRATIONS.length)).toBe(true);
    // done events carry the statement count of their migration.
    for (const e of dones) {
      const migration = MIGRATIONS.find((m) => m.id === e.id)!;
      expect((e as { statements: number }).statements).toBe(migration.statements.length);
    }
  });

  test("aborts with migration + statement position and resumes on re-run", async () => {
    // Fail 0003's second statement (the workflow_run_summary MV) the first time.
    const fake = makeFakeClient((q) => q.includes("workflow_run_summary_mv"));

    let error: Error | null = null;
    try {
      await runMigrations(asClient(fake));
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error!.message).toContain("migration 0003_workflow_run_summary failed");
    expect(error!.message).toContain("statement 2/2");
    // 0003's id is not recorded (its statements didn't all succeed); the two
    // migrations before it are.
    expect(fake.applied).toEqual(new Set(["0001_spans", "0002_trace_summary"]));

    // Clear the fault and re-run: the already-applied prefix is skipped, the
    // rest (starting at the migration that failed) is applied.
    fake.throwOn = undefined;
    const applied = await runMigrations(asClient(fake));
    expect(applied).toEqual(MIGRATIONS.slice(2).map((m) => m.id));
    expect(fake.applied).toEqual(new Set(MIGRATIONS.map((m) => m.id)));
  });
});

describe("modifyMaterializedViewQuery", () => {
  test("emits an in-place ALTER … MODIFY QUERY (no DROP/CREATE)", () => {
    expect(modifyMaterializedViewQuery("trace_summary_mv", "SELECT 1")).toBe(
      "ALTER TABLE trace_summary_mv MODIFY QUERY SELECT 1",
    );
  });

  test("trims surrounding whitespace from the SELECT", () => {
    expect(modifyMaterializedViewQuery("x_mv", "\n  SELECT 1\n  ")).toBe(
      "ALTER TABLE x_mv MODIFY QUERY SELECT 1",
    );
  });
});

describe("MV-change convention", () => {
  test("only the grandfathered migration drops a materialized view", () => {
    const droppers = MIGRATIONS.filter((m) =>
      m.statements.some((s) => /drop\s+view/i.test(s)),
    ).map((m) => m.id);
    expect(droppers).toEqual([LEGACY_MV_DROP_MIGRATION]);
  });
});
