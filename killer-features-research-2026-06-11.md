# Killer features research — reduce spend, improve quality

*Deep research report, 2026-06-11. Audience: the Foglamp founding team deciding
the next two quarters.*

**Method.** A multi-agent deep-research pass: 6 search angles, 27 sources
fetched (arXiv papers, vendor changelogs, pricing pages, HN threads), 118
falsifiable claims extracted, the top 25 put through 3-vote adversarial
verification. **Only 7 claims survived.** That kill rate is a finding in
itself: most headline numbers in this space (FrugalGPT's "98% cost
reduction", LLMLingua's "20x compression", semantic caching's "68% hit
rate") did not survive scrutiny — see [What NOT to bet on](#what-not-to-bet-on).
Everything below cites only verified claims, with confidence noted.

---

## TL;DR

The market is visibly shifting from *passive dashboards* to *active,
closed-loop cost/quality control* — but **nobody has credibly shipped the
full loop yet**. Gateways (Portkey is furthest along) are adding
enforcement, but their enforcement is **quality-blind**: it acts on metadata
rules and token counts, not on whether the agent is looping, hallucinating,
or burning reasoning tokens unproductively. An observability platform sees
exactly the signal gateways lack. The defensible white space for Foglamp is
**quality-informed action**, powered by data we already collect and
competitors don't: per-dimension costs including reasoning tokens,
intra-stream TPS samples, per-span tool catalogs, and workflow-run
structure.

The three bets, ranked:

1. **Reasoning-spend autopilot** — detect overthinking per span, recommend
   per-agent thinking budgets, enforce them via the SDK.
2. **Prompt autopilot** — GEPA-style reflective prompt optimization seeded
   by production failure traces, validated against trace-derived evals,
   delivered as a reviewable diff.
3. **Quality-informed enforcement** — close the observe→act loop the
   gateways can't: runaway-loop circuit breakers and eval-gated model
   downgrades, served through the control-plane layer already on the
   roadmap.

---

## Market state (verified)

- **Gateways are moving from observe to enforce.** Portkey's April 2026
  changelog ships weekly spend-cap windows (`rpw`) and **Model Rules** that
  reject requests at the gateway before traffic reaches the model, based on
  request metadata ([Portkey changelog, Apr 2026][portkey]; Model Rules
  verified 3-0, weekly caps 2-1). These are Enterprise-gated — evidence that
  *enforcement* is what enterprises pay for, consistent with our own
  free-visibility / paid-governance split.
- **But gateway enforcement is quality-blind.** Model Rules act on
  metadata key-value matching and quotas. A gateway cannot tell that an
  agent is in a tool-call loop, that its reasoning trace went redundant
  2,000 tokens ago, or that it passes evals on a cheaper model. That signal
  lives in the trace — our side of the fence.
- **Reasoning tokens are a primary, growing cost driver** for workloads on
  o3 / Claude extended thinking / DeepSeek-R1-class models
  ([Han et al., ACL Findings 2025][token-budget]; verified 2-1, high
  confidence). Foglamp already prices reasoning tokens as a separate
  dimension at ingest; Langfuse, Braintrust, and HoneyHive do not separate
  them (per public docs as of the research date).
- **Time sensitivity.** The gateway-enforcement market is moving fast —
  LiteLLM, OpenRouter, and Vercel AI Gateway may ship quota-style
  enforcement within a quarter or two. The *quota* white space will close;
  the *quality-informed* white space is the durable one, because it
  requires trace data gateways don't have.

---

## Bet 1 — Reasoning-spend autopilot

**What:** A per-agent "reasoning waste" view → recommended thinking budgets
→ optional SDK-enforced caps.

1. **Detect:** flag spans where reasoning output went redundant. Research
   shows the productive→redundant transition in a reasoning stream is
   detectable, and truncating at that point yields **24–27% token reduction
   with no accuracy loss** (Qwen3-8B: 4,262→3,107 tokens at unchanged
   accuracy; DeepSeek-R1-Distill-32B: 3,062→2,319) ([ROM,
   arXiv:2603.22016][rom]; verified 3-0, but an unreviewed math-benchmark
   preprint — treat as directional).
2. **Recommend:** per-agent thinking-budget suggestions from observed
   reasoning-token distributions. Peer-reviewed evidence: dynamic per-query
   budgets achieve **~67% reasoning-token reduction with <3% accuracy
   drop**, and beat static caps ([Han et al., ACL Findings
   2025][token-budget]; verified 2-1).
3. **Enforce:** the SDK applies the budget (`thinkingBudget`/
   `maxReasoningTokens` per provider) via the managed-models control plane
   already on the roadmap — recommendation one click away from action.

**Why us:** detection needs per-span reasoning-token costs (we compute them
at ingest) and intra-stream chunk samples (we already capture TPS over time
within a stream). No OSS observability competitor exposes either signal per
public docs — this is our most defensible data asset. **Feasibility:** high;
detection is a ClickHouse query over data we have, enforcement rides the
planned control plane. **Caveat:** value concentrates on reasoning-model
workloads; an open question is what fraction of Vercel AI SDK users run
them (growing fast, but unmeasured).

## Bet 2 — Prompt autopilot (optimize from production failures)

**What:** Take an agent's failing traces, run a GEPA-style reflective
prompt optimizer against an eval set derived from its own production data
(the save-trace-as-eval roadmap item is the prerequisite), and present the
optimized prompt as a reviewable diff with before/after eval scores — apply
it via managed prompts, or export as a PR.

**Evidence (the strongest verified result in this research):** GEPA
reflective prompt evolution **beats MIPROv2 — the leading optimizer — by
10%+** (e.g. +12% on AIME-2025; verified 3-0) and beats RL-based GRPO by
6% average / up to 20% **while using up to 35x fewer rollouts** (verified
2-1) ([GEPA, arXiv:2507.19457, ICLR 2026 oral][gepa]). The 35x-fewer-rollouts
property is what makes this economically viable as a product feature: the
optimization run itself is cheap. Decagon has written about running GEPA in
production for support agents, which is early commercial validation.

**Why us:** GEPA-style optimization is bottlenecked on (a) realistic failure
examples and (b) a trustworthy eval — exactly what an observability platform
with indexed agent/workflow/session traces plus the planned eval datasets
produces as a byproduct. Langfuse/Braintrust have playgrounds and
experiments; none ships a trace-seeded *optimizer* that closes the loop.
**Feasibility:** medium — needs the eval-dataset roadmap item first, plus an
inference budget per run (a natural paid/Foggy feature). **Risk:** open
question whether teams *act* on automated prompt suggestions; the
reviewable-diff + eval-score framing (like a CI bot, not a black box) is
the mitigation.

## Bet 3 — Quality-informed enforcement (the loop gateways can't close)

**What:** Use trace-quality signals to *act*, not just alert:

- **Runaway circuit breaker:** detect tool-call loops / retry storms /
  token burn within a live session (workflow-run structure + live-tail
  groundwork) and let the SDK halt or degrade the run mid-flight. Practitioner
  threads consistently name runaway agent loops as the scariest cost failure
  mode — it's an insurance product: "Foglamp pays for itself the first time
  it kills a loop."
- **Eval-gated model downgrades:** the ambitious version of the roadmap's
  model-recommendations item — don't just say "agent X passes on a cheaper
  model", offer a guarded rollout (shadow N% of traffic on the cheaper
  model, auto-promote if eval pass-rate holds, auto-rollback otherwise)
  through the control plane.

**Why us:** Portkey-class enforcement proves enterprises pay for control,
but it's metadata/quota-based ([Portkey changelog][portkey]). Enforcement
informed by *what actually happened in the trace* requires our data.
**Feasibility:** circuit breaker is near-term (detection is cheap on our
schema; the SDK needs a kill-switch channel — same latency-sensitive
runtime-config path as managed prompts, so the cache layer is shared).
Guarded rollouts are a quarter-plus behind, gated on evals + A/B
machinery. **Caution:** anything that blocks or reroutes production traffic
needs conservative defaults — recommend-first, enforce as opt-in.

---

## Secondary candidates (worth having, not game-changers)

- **Reasoning-token analytics page** — even without enforcement, a
  "reasoning spend share, trend, and waste estimate per agent" view is a
  cheap, immediately differentiated subset of Bet 1.
- **Cache-layout advisor** — the ambitious version of the roadmap's
  cache-savings item: don't just report hit rate, diff consecutive prompts
  per agent to show *where* the prefix diverges and what reordering would
  make cacheable. (No verified savings number survived for this; the
  mechanism is provider-documented rather than research-backed.)
- **Per-span "what did this token buy" breakdown** — we're the only ones
  pricing per dimension; expose it as a first-class drill-down (input vs
  cached vs reasoning vs output cost stacked per span/agent/week).

## What NOT to bet on

Adversarial verification rejected these popular claims — don't build
marketing or features on them:

| Rejected claim | Vote |
| --- | --- |
| FrugalGPT cascades: "98% cost reduction matching GPT-4" | 0-3 / 1-2 |
| LLMLingua: "20x compression, 1.7–5.7x speedup, minimal loss" | 1-2 / 0-3 |
| Semantic caching: "61–69% cache hit rates" | 0-3 |
| Router papers: "35% cheaper, <2% degradation" (CARROT/vLLM-SR), MixLLM "97% quality at 24% cost", R2-Reasoner "84% savings" | 0-3 / 1-2 |
| DSPy "doubled hallucination-detection recall / 59%→93% jailbreak accuracy" (single preprint) | 0-3 |
| ROM "46.5% latency reduction" (the token-reduction claim survived; the latency claim did not) | 0-3 |

Pattern: **semantic caching, prompt compression, and cascade routing** — the
three most-hyped cost levers — all rest on numbers that didn't verify.
That doesn't mean they never work; it means the headline figures come from
narrow benchmarks that don't transfer, and they shouldn't anchor our
roadmap or copy. Model *recommendations* grounded in the customer's own
evals (our roadmap item) sidestep this: the evidence is the customer's own
data.

## Open questions

1. Does any competitor capture intra-stream chunk-level timing sufficient
   for ROM-style overthinking detection, or is our TPS sampling genuinely
   unique? (Public docs say unique; not audited against internals.)
2. Do engineering teams act on automated prompt suggestions, or does the
   closed loop need a managed/API-first delivery model to see adoption?
3. Is there demand evidence specifically for *quality-informed* routing vs.
   the metadata routing Portkey ships? (Worth testing with design partners
   before building the guarded-rollout machinery.)
4. What fraction of Vercel AI SDK production workloads use reasoning
   models? Sizes Bet 1's near-term impact.

## Caveats

- Competitor gap claims come from public docs/changelogs as of June 2026,
  not product audits; capabilities may have shipped since.
- ROM is an unreviewed, math-benchmark-only preprint with no independent
  replication — directional, not proven-in-production.
- The GEPA-vs-GRPO comparison used a constrained RL baseline; cite GEPA as
  "best-in-class prompt optimization", not "prompting beats fine-tuning".

## Sources

Verified findings rest on four primary sources; the broader sweep covered
27 (vendor changelogs, Braintrust/Arize/Evidently/Comet blogs, HN threads,
additional arXiv papers — most contributed context or were refuted).

- [GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning — arXiv:2507.19457 (ICLR 2026 oral)][gepa]
- [Token-Budget-Aware LLM Reasoning — arXiv:2412.18547 (ACL Findings 2025)][token-budget]
- [ROM: rambling-oriented monitoring for reasoning streams — arXiv:2603.22016 (preprint)][rom]
- [Portkey changelog, April 2026 — weekly rate limits, Model Rules][portkey]

[gepa]: https://arxiv.org/pdf/2507.19457
[token-budget]: https://arxiv.org/pdf/2412.18547
[rom]: https://arxiv.org/abs/2603.22016
[portkey]: https://portkey.ai/docs/changelog/2026/april
