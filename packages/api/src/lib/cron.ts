/**
 * Generic cron scaffold: logger → env interval → re-entrancy guard →
 * setInterval → handle.unref() → initial tick → stop function.
 *
 * The returned stop function is async: it clears the interval AND awaits
 * any in-flight tick so callers can drain cleanly on shutdown.
 */
export function startCron(
  _name: string,
  intervalMs: number,
  fn: () => Promise<void>,
): () => Promise<void> {
  let running = false;
  let inFlight: Promise<void> | null = null;

  const tick = async () => {
    if (running) return;
    running = true;
    inFlight = fn().finally(() => {
      running = false;
      inFlight = null;
    });
    await inFlight;
  };

  const handle = setInterval(() => void tick(), intervalMs);
  (handle as { unref?: () => void }).unref?.();
  void tick();

  return async () => {
    clearInterval(handle);
    if (inFlight) await inFlight;
  };
}
