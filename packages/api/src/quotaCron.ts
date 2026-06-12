import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateQuotaWarnings } from "./services/quotaWarn";

/**
 * Periodically email owners/admins of orgs nearing their span quota. Sibling of
 * the alert + scoring crons; lives in apps/server's long-running process. Hourly
 * by default — quota warnings don't need finer cadence.
 */
export function startQuotaWarnSweep(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.QUOTA_WARN_INTERVAL_MS;
  log.info("quota.warn_started", { intervalMs });
  return startCron("quota.warn", intervalMs, async () => {
    try {
      await evaluateQuotaWarnings(db, ch, log);
    } catch (err) {
      log.error("quota.sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
