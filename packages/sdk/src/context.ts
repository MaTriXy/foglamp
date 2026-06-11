// Trace-context layering shared by the v7 collector and `foglamp/wrap`.
//
// Contexts stack, later layers winning per field, `metadata` maps merging
// (inner keys win) instead of replacing each other:
//
//   wrap()/foglamp() default  →  fog.run(...)  →  fog.with(...)  →  per-call
//
// `fog.run(context, fn)` is the ambient layer: it stores the context in
// AsyncLocalStorage for the duration of `fn`, so every wrapped call inside —
// however deeply nested — picks it up without threading parameters. This is
// how a request handler attaches `workflowRunId`/`sessionId`/`metadata` to
// everything a run does while agents stay module-level singletons.

import { AsyncLocalStorage } from "node:async_hooks";

import type { IntegrationContext } from "./types";

/**
 * Merge `extra` over `base`; `metadata` maps merge deeply (extra keys win).
 * Fields explicitly set to `undefined` in `extra` are ignored rather than
 * clobbering the layer below (`{ agentName: maybeUndefined }` is common).
 */
export function mergeContext(
  base: IntegrationContext,
  extra: IntegrationContext | undefined,
): IntegrationContext {
  if (!extra) return base;
  const merged: IntegrationContext = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  if (base.metadata && extra.metadata) merged.metadata = { ...base.metadata, ...extra.metadata };
  return merged;
}

// Works on Node, Bun, Deno, and Vercel/Cloudflare edge runtimes (all ship
// `node:async_hooks`). The SDK is server-side, so no browser fallback needed.
const storage = new AsyncLocalStorage<IntegrationContext>();

/** The context of the innermost enclosing `fog.run(...)`, if any. */
export function ambientContext(): IntegrationContext | undefined {
  return storage.getStore();
}

/**
 * Run `fn` with `context` as the ambient trace context. Nested calls layer:
 * the inner context merges over the outer one. Returns `fn`'s result, so
 * `await fog.run(ctx, () => handler())` behaves exactly like `handler()`.
 */
export function runWithContext<T>(context: IntegrationContext, fn: () => T): T {
  const outer = storage.getStore();
  return storage.run(outer ? mergeContext(outer, context) : context, fn);
}
