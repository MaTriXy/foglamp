# Roadmap

Ideas parked for later. Not commitments.

## 🛸 Autopilots

Closed-loop control of cost/quality, not just dashboards. Gateways are adding
enforcement, but it's *quality-blind* — our edge is **quality-informed action**,
built on signals only we collect (reasoning-token cost, intra-stream TPS,
per-span tool catalogs, workflow structure).

### 🧠 Reasoning-spend autopilot

Detect overthinking per span, recommend per-agent thinking budgets from observed
reasoning-token distributions, and enforce via the SDK (`thinkingBudget` /
`maxReasoningTokens`). Built on data only we expose.

### ✍️ Prompt autopilot

Run a GEPA-style reflective optimizer on an agent's failure traces against a
trace-derived eval set, shipped as a reviewable diff with before/after scores.
Needs save-trace-as-eval first.

### 🚦 Quality-informed enforcement

Act on trace quality, not just alert: a circuit breaker that kills runaway
tool-call loops / token burn in flight, and eval-gated model downgrades. ⚠️
Recommend first, enforce opt-in.

## 🌐 Platform & reach

### 📡 OTLP / OpenTelemetry ingestion

Implement the stubbed `POST /v1/traces` (currently 501) to accept OTLP/HTTP and
map gen_ai/OpenLLMetry attributes onto span rows — unlocks Python, LangChain, etc.

### 🐍 More SDKs (Python, LangChain)

First-class SDKs beyond the Vercel AI SDK, or lean on OTLP ingestion above. 

### 🔌 Data API / export

Let users query their own traces/metrics/scores programmatically, or export them.
Read-only API keys + a typed query endpoint.

### 🔗 MCP server

A Model Context Protocol server so coding agents (Claude Code, Cursor) and Foggy
can query a project's traces, metrics, and evals directly — "why is the refund
agent failing?" pulls the failing traces in-editor. Read-only, scoped to the
project's API key; the agent-native counterpart to the Data API.

### 🔒 PII redaction at ingest (ee)

Opt-in scrubbing of inputs/outputs before storage (reuse the PII code-scorer
patterns). A compliance unlock — the buyer is a compliance officer, not a dev.

## 🎯 Quality & evals

### 🗃️ Datasets + save-trace-as-eval-case

Turn production traces into labeled datasets, then run offline/CI evals against
them — a regression suite before deploy.

### 🙋 Human-in-the-loop annotation queue

A review UI to thumbs/score traces, feeding the eval datasets above (can be both from user or user's user).  
Closes the loop between production data and eval ground truth.

### 🧭 Model recommendations (cost × eval) (ee)

"Agent X passes eval Z on a cheaper model with Y% loss — switch and save N%."  
Join scores ↔ spans by subject model. Listed on pricing; built on request.

### 📉 Relative regression alert thresholds

Add a delta/baseline comparison to alerts (e.g. pass-rate drops >10% vs prior
window), instead of only fixed thresholds. Small tweak to the alert engine.

## 🎛️ Control plane (runtime config)

These serve config to the running app at request time, so the shared risk is
**latency**: a naive per-call fetch adds a network hop before the LLM call. All
need an SDK cache / edge delivery / build-time sync to stay off the hot path.

### 📝 Manage prompts

Store and version prompts in foglamp; the SDK pulls them at runtime so you can
edit without a deploy. ⚠️ Latency: cache aggressively to avoid a per-call hop.

### 🔀 Manage models

Pick an agent's model + params from the dashboard and swap without shipping code.
⚠️ Latency: same runtime-config-fetch concern — share the prompt cache layer.

### 🆎 A/B tests — (ee)

Run prompt/model variants in production, assign traffic, compare quality × cost ×
latency (the online counterpart to Experiments — which stays free). ⚠️ Latency:
cache variant assignment.

## 🐛 Debugging & DX

### ↔️ Trace diff

Pick two runs of the same agent/workflow and compare inputs/outputs/steps/cost/
latency side by side. The complement to replay.

### ▶️ Move replay from waterfall to actual answer

See how was the text streaming to the user.

### 🧰 Tools page

Aggregate view over `tool` spans: per-tool call volume, p50/p95 latency, error
rate, cost contribution. Mirrors the Agents/Workflows pages.

### 🩺 Tool diagnosis (dead & misused tools)

Diff the captured tool catalog against the tools actually called across a
project's traces: surface tools that are offered but never invoked (dead weight
in the prompt), and tools the model picks wrongly (low `tool_selection` scores).
Built on the per-span `tool_catalog` column.

### 🧩 Error clustering (Sentry-style)

Group failing traces by error signature into "issues" with counts and trends,  
instead of a flat list.

## 💰 Cost intelligence

### 🧾 Per-customer / per-session cost attribution

Roll cost up by end-customer via `sessionId`/`metadata` — gold for anyone doing
usage-based pricing on top of foglamp.

### ⚡ Cache-savings insights

Surface cache hit-rate (we already track cached/cache-write tokens) and "you'd
save $X with prompt caching."

### 💸 Spend budgets — *Enterprise-only*

Extend the quota/alert machinery to per-project/agent spend budgets with warn
thresholds and notifications. Cost *visibility* stays free; cost *governance* is
the org feature.

## 📟 Reliability & ops

### 🔔 More alert channels

Slack / Discord / generic webhook delivery, alongside the existing email
channel — all free. PagerDuty delivery is *Enterprise-only* (the on-call-rotation
signal).

## 🏢 Enterprise (`ee/`)

The backbone of the commercial tier — features enterprises budget for and solo
devs never miss. All live under `ee/` with a commercial license; everything else
stays Apache 2.0. Items elsewhere in this file marked *Enterprise-only* land
here too.

### 🔑 SSO / SAML

SAML + OIDC single sign-on with enforced-SSO orgs and SCIM provisioning.
The first checkbox on every enterprise security questionnaire.

### 👥 RBAC

Roles beyond owner/member — viewer, billing-only, per-project access, custom
roles. Required once a customer's org chart is bigger than one team.

### 📜 Audit logs

Who did what, when: auth events, config changes, API key lifecycle, data  
exports. Queryable in-app and streamable to the customer's SIEM.

## 🌫️ AI-native (Foggy)

### 🔬 Auto-RCA on alerts — *Enterprise-only*

When an alert fires, have Foggy summarize the likely cause from the offending
traces and attach it to the notification. Real inference cost per alert; value
scales with org size.

### 📧 Weekly digest email

"Your agents this week": volume, cost, top errors, eval drift. A proactive
retention hook.