# Code Quality Audit — June 11, 2026

Full-codebase smell review (apps/web, apps/server, apps/ingest, packages/*, scripts/). No changes were made; this is a findings report. Line numbers reference the current state of `master` (2ae30b7).

---

## Top themes

1. **Copy-paste is the #1 smell.** The same helpers, components, and scaffolding are duplicated 3–6× instead of being shared — and some copies have already silently diverged.
2. **Unbounded in-memory maps.** Several caches/rate-limit maps in `apps/server` and `apps/ingest` are never pruned — slow memory leaks in long-lived processes.
3. **apps/server is the less-disciplined sibling of apps/ingest.** Ingest has body limits, graceful shutdown, prune timers, and zod validation; server's `/foggy` endpoint has none of those.
4. **A handful of real correctness/perf issues** hidden among the style issues (full-table-scan detail fetch, decimal precision mismatch, restart-resets-email-dedup).

---

## HIGH severity

### Frontend (apps/web)

- **W-H1. Heatmap kit copy-pasted 6×.** `HEAT_SHADES`, `PCT_RANGE`, `percentileBucket`, and a private `HeatCell` component are character-for-character duplicated in `traces-client.tsx:124`, `agents-client.tsx:118`, `workflows-client.tsx:121`, `sessions-client.tsx:115`, `evals-client.tsx:221`, and `session-detail-client.tsx:64`. One copy (evals) already diverged in tooltip wording. Extract into `components/app/data-table.tsx`.
- **W-H2. `pageWindow` copied into 5 files** (`traces-client.tsx:89`, `agents-client.tsx:93`, `workflows-client.tsx:96`, `sessions-client.tsx:82`, `eval-detail-client.tsx:89`) even though it's already exported from `components/app/trend-charts.tsx:161` and correctly imported elsewhere. Fix is literally an import swap.
- **W-H3. `overview-client.tsx:112–210` privately redefines** `makeBucketLabel`/`formatBucketFull`/`thinTicks`/`makeEdgeTick` — byte-for-byte copies of the exported versions in `trend-charts.tsx:59–157` — plus a stranded private `ChartLegend` with an incompatible API.
- **W-H4. Copy-to-clipboard button reimplemented 4×** (`traces-client.tsx:677`, `sessions-client.tsx:541`, `trace-detail-client.tsx:955`, `eval-detail-client.tsx:806`): identical `useState` + `clipboard.writeText` + 1.5s reset around `<CopyIcon>`. Needs one shared `<CopyButton>`.
- **W-H5. God components:** `evals-client.tsx` (1189 lines — list + 3-step create wizard + delete dialog + heatmap), `overview-client.tsx` (1032), `trace-detail-client.tsx` (977), `agent-detail-client.tsx` (832), `eval-detail-client.tsx` (825), `org-settings-client.tsx` (798). Each mixes data fetching, mutations, and several distinct UI surfaces.

### Backend apps (server + ingest)

- **S-H1. `/foggy` checks rate limit last** (`apps/server/src/foggy.ts:64–91`): order is session → body parse → DB project-access query → rate limit. A rate-limited user still costs a body parse and a Postgres round-trip per rejected request. Ingest does it in the correct order.
- **S-H2. Three unpruned caches in ingest:** `apiKey.ts:21,30` (`cache`, `lastUsedWrites`) and `customPricing.ts:13` are never wired into the 60s prune timer in `main.ts:56–59` (unlike `rateLimit`/`orgLimits` which are). Unbounded growth with key/project churn.
- **S-H3. Server SIGTERM doesn't drain in-flight work** (`main.ts:64–70`): the three cron `stop*()` functions only `clearInterval`; an in-flight scoring batch (with LLM judge calls) is abandoned mid-execution, potentially leaving claimed-but-unsettled `eval_job` rows. Ingest, by contrast, has a proper async `shutdown()` with buffer drain.
- **S-H4. `/foggy` has no body size limit** — ingest uses Hono `bodyLimit` (`INGEST_MAX_BODY_BYTES`); server applies nothing. Authenticated memory-exhaustion vector.
- **S-H5. `foggyRateLimit.ts:12–13` maps never pruned** — one entry per user forever; server has no prune timer at all.

### API package (packages/api)

- **A-H1. `getAgentDetail` fetches ALL agents then `.find()`s one** (`services/agents.ts:115–122`) — full `GROUP BY agent_name` scan for a single-row need. `listAgents` already supports an `agentName` filter.
- **A-H2. Plan-limit enforcement copy-pasted 3×** (`projects.ts:24`, `alerts.ts:96`, `evals.ts:137`): same `getOrgPlan` → count → compare → same error template, down to the pluralization ternary. One `enforceLimit()` helper would replace all three.
- **A-H3. `requireProjectAccess` + `requireOrgRole` = double DB round-trip on every write path** (`projects.ts:68` ×5, `providerKeys.ts:45,83`) — the second query re-fetches a role the first query already had in scope.
- **A-H4. Quota-warning email dedup is an in-process `Map`** (`quotaWarn.ts:14`): wiped on every restart/deploy → re-emails everyone above 90%; also duplicates across replicas. Needs a `lastWarnedAt` column.

### Shared packages + scripts

- **P-H1. SDK collector constants/functions duplicated** between `sdk/src/collector.ts:117–136` and `sdk/src/wrap/collector.ts:28–46` (`MAX_SPANS_PER_TRACE`, `ERROR_MESSAGE_CAP`, sampling constants, `decimateSamples`) — the copy even says "Mirrors collector.ts" in a comment. Same for `toInt` (`usage.ts:9` vs `wrap/usage.ts:25`).
- **P-H2. Decimal precision mismatch:** Postgres custom pricing is `numeric(24,12)` (`db/src/schema/pricing.ts:11`) but ClickHouse + cost engine use scale 10 (`clickhouse/src/migrations.ts:48`, `COST_SCALE = 10`). Custom prices needing >10 decimal places get silently truncated.
- **P-H3. `scripts/backfill-costs.ts` builds raw SQL via string interpolation** with a home-grown `q()` escaper instead of the client's parameterized queries (lines 53–59, 108, 241, 273). One-off script, but it writes to production spans data.
- **P-H4. Dead `?? ""` fallbacks on Stripe secrets** in `auth/src/index.ts:117,124` — unreachable today, but would silently register the Stripe plugin with an empty webhook secret if the guard above ever changes.

---

## MEDIUM severity

### Frontend
- Dead `SORT_LABELS` constants in `traces-client.tsx:110` and `sessions-client.tsx:103` (never read).
- Formatting bypasses `lib/format.ts` in at least 5 places: `admin-client.tsx:183` (bare `toLocaleString`, locale-dependent output), `settings-client.tsx:278` (imports `date-fns` for one call), `platform-client.tsx:101` (bare `toLocaleDateString`), `pricing-client.tsx:106` (private `formatPrice` instead of `formatCost`), plus local `formatMrr`/`formatBytes` in `platform-client.tsx:33–53`.
- Private `Stat` component duplicated in `agents-client.tsx:582` and `workflows-client.tsx:591` — already diverged (workflows added `valueClassName`).
- `useEffect(() => setPage(0), [...])` reset anti-pattern in all 4 list pages with inconsistent dep arrays — causes a one-render flash of the stale page.
- Hardcoded hex colors (`#0090FD` Foggy blue, `#FF5513`) repeated across ≥8 files with no token/constant (overview, agent/workflow detail, foggy-widget, foggy-mock).
- `"/overview"` hardcoded as post-auth redirect in 3 places (`org-settings-client.tsx:208`, `accept-invitation-client.tsx:66,78`).
- `overview-client.tsx:62` imports `cn` from `@/lib/utils` while everything else uses `@foglamp/ui/lib/utils`.
- Hardcoded fallback judge model `"gemini-3.1-flash-lite"` in `evals-client.tsx:448` instead of referencing the `JUDGE_MODELS` catalogue.

### Backend apps
- `evlog.ts` scaffold duplicated between server (57 lines) and ingest (27 lines) — divergence is deliberate and commented, but core pattern changes require two edits.
- `customPricing.ts:54` compiles a fresh `RegExp` per span × per rule in the ingest hot path (~5,000 compiles for a 500-span batch with 10 rules). Compile once when rules are cached.
- `/foggy` body is `as`-cast, not zod-validated (`foggy.ts:64–73`) — arbitrary message shapes flow into the AI SDK; ingest correctly uses `safeParse`.
- `rateLimit.ts:39–43` silently swallows Redis errors with no log — a sustained Redis outage is invisible.
- Server SIGTERM handler has no `process.exit`/drain/log (vs. ingest's careful `shutdown()`).
- Dead QStash remnants: `"/queue/"` in `evlog.ts:13` skip-list + commented-out env vars in `env/src/server.ts:94–101`.
- `foggyTools.ts` magic numbers (8s fetch timeout, 7-day default window, `.slice(0, 60)` span cap, `limit ?? 15`) not named or env-tunable, unlike ingest's equivalents.

### API package
- `toCh()` in `evals.ts:343` privately re-implements the exported `toClickHouseDateTime()` from `lib/util.ts:33` — the file already imports other helpers from there.
- `quantiles()` defined identically in `metrics.ts:20`, `agents.ts:16`, `workflowRuns.ts:172`; `finite()` inlined in 3 files; `ymd()` defined in `orgs.ts:40`, `quotaWarn.ts:18`, `platform.ts:44`; `ADMIN` role array in `projects.ts:13` and `providerKeys.ts:10`. All belong in `lib/util.ts` / `services/access.ts`.
- The three cron files (`scoringCron.ts`, `alertCron.ts`, `quotaCron.ts`) are the same 41-line scaffold; a `startCron(name, intervalMs, fn)` factory removes ~80 lines and one drift risk.
- Alert emails sent serially inside nested loops (`alertEvaluator.ts:234–248`) — a slow email provider stalls the whole sweep; should be `Promise.all` per rule.
- `workflows.list` and `workflowRuns.list/summary` skip `resolveRange`, so omitted dates mean all-time/unbounded data, unlike every sibling endpoint that defaults to 24h (`routers/workflows.ts:42`, `routers/workflowRuns.ts:34,48`).
- `getAgentDetail` calls `listTraces` with no time filter (`agents.ts:134`) — unbounded ClickHouse scan per detail-page view.
- `console.error` instead of the structured `evlog` logger in `platform.ts:98`.
- `env.CORS_ORIGIN.replace(/\/$/, "")` base-URL construction duplicated (`alertEvaluator.ts:233`, `quotaWarn.ts:64`).

### Shared packages
- Localhost-detection condition duplicated in `auth/src/index.ts:31` and `env/src/server.ts:143`.
- `auth/src/index.ts:94` re-implements the billing-enabled condition inline instead of calling `isBillingEnabled()` from `@foglamp/billing` (which it already imports from).
- ClickHouse column default `retention_days = 30` (`migrations.ts:354`) vs `DEFAULT_RETENTION_DAYS = 3` (`billing/src/index.ts:56`) — intentional but uncompiled-checked divergence.
- Magic numbers `3650` / `65535` for unlimited retention clamp in `auth/src/index.ts:108`.
- SDK `flush()` coalescing can return before traces enqueued mid-flight are sent in serverless direct-flush paths (`sdk/src/transport.ts:74–86`); the gap is acknowledged in `shutdown()` but not in `flush()` docs.
- SDK `onError` can't attribute errors with multiple concurrent traces, so crashed traces wait up to 10 min for the reaper (`collector.ts:433–457`) — known limitation, undocumented to users.
- `queries.ts` duplicates filter/HAVING construction between `listTraces`/`traceListSummary` (lines 72–88 vs 169–182) and the session pair — only workflows got the shared `workflowHaving` helper treatment.

---

## LOW severity (selected)

- 7 list pages use clickable `<TableRow onClick>` navigation with no keyboard/a11y support.
- `DECIMAL_RE` regex duplicated within `packages/cost` (`decimal.ts:8` vs `pricing.ts:35`).
- `scaledCost` comment in `cost/src/decimal.ts:33` claims "round half-up (div is even)" — the reasoning in the comment is wrong (result is fine to 1 ULP).
- `dt64` in `scripts/backfill-costs.ts:54` is a copy of `toClickHouseDateTime64` from `clickhouse/src/spans.ts:58` — could just import it.
- `services/admin.ts` is 2,129 lines; ~1,400 of it is a test-data generator with ~500 lines of embedded conversation fixtures that should live in its own file.
- `MAX_PAYLOAD_CHARS` (contracts) and `CONTRACT_MAX_PAYLOAD` (sdk/config.ts) are two unlinked copies of `1_000_000`.
- Dead `readonly version = "agent-v1"` on `FoglampAgent` (`sdk/src/wrap/index.ts:329`).
- `LimitsOverride` (db) and `PlanLimits` (billing) are structurally identical but unlinked types.
- `globToRegExp` in `customPricing.ts:55` silently treats `?` as a literal — users writing `gpt-4?` patterns match nothing.
- Server has no `/health` endpoint while ingest does — deployment asymmetry.
- `WARN_FRACTION = 0.9` in `quotaWarn.ts:16` and the usage-banner 0.9 threshold in `orgs.ts:85` are coupled but unlinked.
- Two reviewers independently flagged the default `FOGGY_MODEL = "gemini-3.1-flash-lite"` (`env/src/server.ts:108`) as a possibly invalid model ID — worth verifying against Google's current model list; if it's wrong, Foggy fails every request when the env var is unset.

---

## Suggested attack order (if/when you fix)

1. **Quick wins, zero risk:** import-swap the 5 `pageWindow` copies; delete the dead overview chart helpers; delete `SORT_LABELS`; extract `quantiles`/`ymd`/`finite`/`toCh`/`ADMIN` into `lib/util.ts`/`access.ts`.
2. **Shared components:** `HeatCell` + `percentileBucket` + `CopyButton` + `Stat` → kills ~300 lines of duplication across 10+ files.
3. **Correctness/perf:** A-H1 (agent detail scan), A-H8/M8 (unbounded trace scan), P-H2 (decimal precision), A-H4 (email dedup column), S-H1/S-H4 (foggy rate-limit order + body limit).
4. **Hygiene timers:** wire `apiKey`/`customPricing`/`foggyRateLimit` prunes into interval timers; add graceful shutdown to apps/server.
5. **Structural:** `enforceLimit()` helper, `startCron()` factory, zod-validate `/foggy` body, split the god components when you next touch each page.
