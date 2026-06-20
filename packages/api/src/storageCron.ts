import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateClickHouseStorage } from "./services/storageWatch";

/**
 * Periodically check total ClickHouse on-disk size and email platform admins
 * when it exceeds the configured threshold. Sibling of the alert/quota/scoring
 * crons; lives in apps/server's long-running process. Every 4h by default —
 * storage creeps up slowly, so a coarse cadence is plenty.
 */
export function startStorageWatchSweep(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.CLICKHOUSE_SIZE_WATCH_INTERVAL_MS;
  log.info("storage.watch_started", { intervalMs });
  return startCron("storage.watch", intervalMs, async () => {
    try {
      await evaluateClickHouseStorage(ch, log);
    } catch (err) {
      log.error("storage.sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
