import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateAlerts } from "./services/alertEvaluator";

/**
 * Start the alert evaluator on a fixed interval (a Bun/Node `setInterval`).
 * Lives in apps/server's long-running process; the ingest and web tiers don't
 * run it. Returns a stop handle for graceful shutdown. Each sweep is guarded so
 * a slow run never overlaps the next tick.
 */
export function startAlertEvaluator(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.ALERT_EVAL_INTERVAL_MS;
  log.info("alert.evaluator_started", { intervalMs });
  return startCron("alert.evaluator", intervalMs, async () => {
    try {
      await evaluateAlerts(db, ch, log);
    } catch (err) {
      log.error("alert.sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
