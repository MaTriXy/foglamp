// Best-effort live cost for the HUD ticker. Runs only on the lazy HUD path, so
// @foglamp/cost (and its zod/contracts deps) are bundled into the HUD chunk and
// never touch the core `.` entry's footprint.
//
// We fetch the OpenRouter pricing table directly and parse it with @foglamp/cost's
// *pure* `parsePricingResponse` (and price with `priceSpan`). We deliberately do
// NOT use @foglamp/cost's `getPricingTable()` — that path imports the validated
// server env (DATABASE_URL etc.), which a HUD/dev process won't have. We pre-warm
// on the first trace; until the table is ready `priceTraceUsd` returns null and
// the HUD shows "—" (never a misleading $0).

import { parsePricingResponse, priceSpan, type PricingTable } from "@foglamp/cost";

import type { Span } from "../wire";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

let table: PricingTable | null = null;
let warming = false;

/** Test seed: install a table so warmPricing() short-circuits (no network). */
export function seedPricingTable(t: PricingTable | null): void {
  table = t;
}

/** Kick off (once) the background fetch of the OpenRouter pricing table. */
export function warmPricing(): void {
  if (table || warming) return;
  warming = true;
  fetch(OPENROUTER_MODELS_URL, { headers: { accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`pricing ${res.status}`))))
    .then((body) => {
      table = parsePricingResponse(body);
    })
    .catch(() => {
      // Offline / fetch failed — cost stays "—". Retried on the next warm.
    })
    .finally(() => {
      warming = false;
    });
}

/**
 * Sum a trace's priced span costs (USD). Returns null when the table hasn't
 * loaded yet or no span could be priced (unknown model) — so the HUD shows "—"
 * rather than understating the spend.
 */
export function priceTraceUsd(spans: Span[]): number | null {
  if (!table) return null;
  let total = 0;
  let priced = false;
  for (const span of spans) {
    if (span.spanType !== "llm" && span.spanType !== "embedding") continue;
    const { costs } = priceSpan({
      table,
      provider: span.provider,
      modelId: span.modelId,
      usage: span.usage,
    });
    if (costs.totalCost == null) continue;
    const n = Number(costs.totalCost);
    if (Number.isFinite(n)) {
      total += n;
      priced = true;
    }
  }
  return priced ? total : null;
}
