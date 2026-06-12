import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateEvals, executeJobs } from "./services/scoringWorker";

/**
 * Start the eval scoring worker on a fixed interval — the sibling of the alert
 * evaluator (alertCron.ts). Lives in apps/server's long-running process; ingest
 * and web don't run it. Each sweep is guarded so a slow run (judge LLM calls)
 * never overlaps the next tick. Returns a stop handle for graceful shutdown.
 */
export function startScoringWorker(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.SCORING_EVAL_INTERVAL_MS;
  log.info("eval.scoring_started", { intervalMs });
  return startCron("eval.scoring", intervalMs, async () => {
    try {
      // Plan first (claim windows → enqueue jobs), then execute what's queued.
      await evaluateEvals(db, ch, log);
      await executeJobs(db, ch, log);
    } catch (err) {
      log.error("eval.sweep_loop_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
