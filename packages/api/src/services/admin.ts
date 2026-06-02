import {
	sendAlertEmail,
	sendInvitationEmail,
	sendMagicLinkEmail,
	sendQuotaWarningEmail,
} from "@foglamp/auth/email";
import {
	type ScoreRow,
	type SpanRow,
	insertScores,
	insertSpans,
} from "@foglamp/clickhouse";
// Dev-only test-data generator. Synthesizes realistic spans and inserts them
// straight into ClickHouse (same `spans` table ingest writes to), so the
// rollup materialized views — trace_summary, workflow_run_summary,
// metrics_by_minute — populate exactly as they would from real traffic. The
// surfacing UI (the Admin tab) is gated to development; these procedures stay
// project-access-checked so they're safe even against a production server.
import {
	type CostBreakdown,
	EMPTY_BREAKDOWN,
	type PricingTable,
	getPricingTable,
	priceSpan,
} from "@foglamp/cost";
import { evalDefinition, evalState } from "@foglamp/db/schema/eval";
import { env } from "@foglamp/env/server";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

export const TEST_KINDS = [
	"bare",
	"agent",
	"workflow",
	"tool",
	"full",
	"mega",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];

// OpenRouter canonical ids (provider/model). Passed verbatim so they resolve
// against the pricing table without normalization guesswork; at runtime we keep
// only the ones actually present so cost computes instead of going null.
const CANDIDATE_MODELS = [
	"openai/gpt-4o-mini",
	"openai/gpt-4o",
	"anthropic/claude-3.5-sonnet",
	"anthropic/claude-3.5-haiku",
	"google/gemini-2.0-flash-001",
	"google/gemini-flash-1.5",
	"meta-llama/llama-3.3-70b-instruct",
	"mistralai/mistral-small",
	"deepseek/deepseek-chat",
	"x-ai/grok-2-1212",
];

function pickModels(table: PricingTable): string[] {
	const present = CANDIDATE_MODELS.filter((id) => table.has(id));
	return present.length > 0 ? present : CANDIDATE_MODELS;
}

// Tool names for synthetic tool spans (agentic loops). Embedding model for
// `embedding` spans — priced like an llm step if present in the table, else null.
const TOOL_NAMES = [
	"web_search",
	"fetch_url",
	"query_db",
	"run_code",
	"read_file",
	"vector_search",
	"calculator",
	"send_email",
];
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

// Long, multi-turn conversations for the `mega` dataset so the trace-detail
// payload panes render realistic chat history instead of a one-line prompt.
// Each entry is a full message array (system + several user/assistant turns)
// plus the model's final reply.
type Conversation = {
	messages: { role: "system" | "user" | "assistant"; content: string }[];
	reply: string;
};
const CONVERSATIONS: Conversation[] = [
	{
		messages: [
			{
				role: "system",
				content:
					"You are Foglamp's support assistant. Be concise, cite docs when relevant, and never fabricate API names.",
			},
			{
				role: "user",
				content:
					"Hey — we just wired up the SDK but our spans aren't showing up in the dashboard. We're calling traceName() on every request. What are we missing?",
			},
			{
				role: "assistant",
				content:
					"A few common causes: (1) the exporter is buffering and your process exits before flush — call `await foglamp.shutdown()` on teardown; (2) the API key is scoped to a different project; (3) the ingest endpoint is being blocked by an egress proxy. Which environment is this — local, staging, or prod?",
			},
			{
				role: "user",
				content:
					"It's a serverless function on prod. Short-lived. So probably the flush thing?",
			},
			{
				role: "assistant",
				content:
					"Almost certainly. In serverless the runtime can freeze the process the moment your handler returns, dropping anything still in the buffer.",
			},
			{
				role: "user",
				content:
					"Okay. How do I flush without adding latency to every request? We're at ~2k rps.",
			},
		],
		reply:
			"You have two good options. First, set `flushOnExit: true` and register the SDK's handler so it drains on the platform's shutdown signal rather than per-request — zero added latency on the hot path. Second, if your platform supports `waitUntil()` (Vercel, Cloudflare Workers), pass `foglamp.flush()` to it so the flush runs after the response is sent. Avoid awaiting flush inside the handler at 2k rps — that serializes a network round-trip into your latency budget. For belt-and-suspenders, also lower `maxBatchAgeMs` to ~1000 so buffered spans never sit longer than a second. With either approach your spans will land within a second or two of the request completing.",
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a research agent. Decompose the question, gather evidence, and answer with a short synthesis.",
			},
			{
				role: "user",
				content:
					"Compare the cost of running our summarization workload on gpt-4o-mini vs claude-3.5-haiku vs gemini-2.0-flash. Assume ~1.2M input tokens and 300k output tokens per day.",
			},
			{
				role: "assistant",
				content:
					"Let me pull current per-1M pricing for each, then compute daily and monthly totals at your volume.",
			},
			{
				role: "user",
				content:
					"Also factor in that about 40% of our input is cacheable (same system prompt + retrieved context).",
			},
			{
				role: "assistant",
				content:
					"Good — cache reads are billed at a fraction of the input rate, so a 40% cache-hit rate meaningfully changes the ranking. Computing both the naive and cache-adjusted numbers.",
			},
			{
				role: "user",
				content: "Great, give me the bottom line plus a recommendation.",
			},
		],
		reply:
			"Bottom line at 1.2M in / 300k out per day, with 40% of input served from cache:\n\n• gpt-4o-mini — ~$0.34/day input (cache-adjusted) + ~$0.18/day output ≈ $0.52/day (~$15.6/mo)\n• claude-3.5-haiku — ~$0.58/day + ~$0.30/day ≈ $0.88/day (~$26.4/mo)\n• gemini-2.0-flash — ~$0.11/day + ~$0.09/day ≈ $0.20/day (~$6/mo)\n\nRecommendation: if quality is acceptable, gemini-2.0-flash is ~3x cheaper than gpt-4o-mini for this profile. But for summarization specifically, gpt-4o-mini tends to hold structure better on long inputs — I'd A/B the two with your relevance eval before committing, since the absolute spend is small enough that quality should drive the call.",
	},
	{
		messages: [
			{
				role: "system",
				content: "You triage incoming support tickets and route them.",
			},
			{
				role: "user",
				content:
					"Ticket #4821: 'Billing charged me twice this month and I can't reach anyone. This is the third time. Considering disputing with my bank.' — classify severity and route.",
			},
			{
				role: "assistant",
				content:
					"This is high severity: duplicate charge (financial impact), repeat occurrence (third time), and explicit churn/chargeback risk. Sentiment is strongly negative.",
			},
			{
				role: "user",
				content: "Who should it go to, and what's the suggested first reply?",
			},
		],
		reply:
			'Route to: Billing escalations queue, flagged P1, with a copy to the account\'s CSM given the churn signal. Suggested first reply: "I\'m really sorry — a double charge three months running is not acceptable, and I\'ve escalated this as a priority. I can see the duplicate on [date]; I\'m issuing the refund now and it should clear in 3–5 business days. To make sure this stops recurring, I\'m also having our billing team audit the subscription on your account today and I\'ll personally follow up with what they find by tomorrow." Tag: billing, duplicate-charge, churn-risk, chargeback-threat.',
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a coding assistant embedded in an observability platform.",
			},
			{
				role: "user",
				content:
					"Our p99 latency on the ingest endpoint jumped from 80ms to 1.4s starting around 2am. No deploys went out. Where do I even start?",
			},
			{
				role: "assistant",
				content:
					"Start by separating 'slow to accept' from 'slow downstream'. Check: (1) did ingest volume spike at 2am — a batch backfill or a retrying client? (2) is the p99 concentrated on one project/org or spread evenly? (3) ClickHouse insert latency — is the async insert queue backing up? Pull those three and we'll narrow it fast.",
			},
			{
				role: "user",
				content:
					"Volume roughly doubled at 2am and stayed there. p99 is concentrated on one org. ClickHouse insert latency is normal.",
			},
			{
				role: "assistant",
				content:
					"That points away from your storage layer and toward a single noisy tenant. Doubled volume from one org, normal CH latency, no deploy — likely a client of theirs started sending oversized batches or unbounded payloads that are expensive to parse/validate.",
			},
			{
				role: "user",
				content: "How do I confirm and contain it without blocking them entirely?",
			},
		],
		reply:
			"Confirm: group ingest spans for that org by payload size and span-count-per-batch over the last 6h — you'll likely see a step change at 2am toward huge batches. Also check whether one of their API keys accounts for the bulk. To contain without a hard block: apply a per-org rate limit / max-batch-size at the edge (return 429 with Retry-After so well-behaved clients back off), and queue rather than reject if you can absorb it. Then reach out to the org — this is usually an accidental loop or a backfill they didn't throttle. Longer term, make per-tenant payload-size and rate limits a default so one client can't degrade shared p99.",
	},
	{
		messages: [
			{
				role: "system",
				content: "You extract structured data from unstructured documents.",
			},
			{
				role: "user",
				content:
					"Pull the parties, effective date, term length, and termination notice period from this MSA excerpt: 'This Master Services Agreement is entered into as of March 3, 2025 by and between Acme Cloud Inc. and Northwind Analytics LLC. The initial term shall be twenty-four (24) months, automatically renewing for successive twelve (12) month periods unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current term.'",
			},
		],
		reply:
			'{\n  "parties": ["Acme Cloud Inc.", "Northwind Analytics LLC"],\n  "effective_date": "2025-03-03",\n  "initial_term_months": 24,\n  "auto_renew": true,\n  "renewal_term_months": 12,\n  "termination_notice_days": 60,\n  "notice_form": "written"\n}',
	},
];

const rnd = (min: number, max: number) =>
	Math.floor(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length)]!;

// Synthesize plausible intra-stream samples for seed data: cumulative tokens
// from first-token (ttft) to step end, with mild per-interval jitter so the
// TPS curve isn't a flat line. Mirrors the SDK's [offsetMs, cumTokens] arrays.
function synthChunks(
	ttftMs: number,
	durationMs: number,
	outputTokens: number,
): { offsets: number[]; tokens: number[] } {
	if (outputTokens <= 0 || durationMs - ttftMs < 50)
		return { offsets: [], tokens: [] };
	const steps = Math.min(20, Math.max(4, Math.round(outputTokens / 25)));
	const span = durationMs - ttftMs;
	const offsets: number[] = [];
	const tokens: number[] = [];
	let acc = 0;
	const weights = Array.from(
		{ length: steps },
		() => 0.6 + Math.random() * 0.8,
	);
	const totalWeight = weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < steps; i++) {
		acc += weights[i]!;
		offsets.push(Math.round(ttftMs + (span * (i + 1)) / steps));
		tokens.push(Math.round((acc / totalWeight) * outputTokens));
	}
	tokens[tokens.length - 1] = outputTokens; // anchor the final cumulative count
	return { offsets, tokens };
}

function costCols(c: CostBreakdown) {
	return {
		prompt_cost: c.promptCost,
		completion_cost: c.completionCost,
		request_cost: c.requestCost,
		image_cost: c.imageCost,
		web_search_cost: c.webSearchCost,
		internal_reasoning_cost: c.internalReasoningCost,
		cache_read_cost: c.cacheReadCost,
		cache_write_cost: c.cacheWriteCost,
		total_cost: c.totalCost,
	};
}

function emptyRow(projectId: string, orgId: string, start: number): SpanRow {
	return {
		project_id: projectId,
		org_id: orgId,
		retention_days: 30,
		trace_id: "",
		span_id: "",
		parent_span_id: "",
		span_type: "agent",
		name: "",
		start_time: start,
		end_time: start,
		duration_ms: 0,
		status: "ok",
		error_message: "",
		provider: "",
		model_id: "",
		priced_model_id: "",
		input_tokens: 0,
		output_tokens: 0,
		total_tokens: 0,
		reasoning_tokens: 0,
		cached_input_tokens: 0,
		cache_write_input_tokens: 0,
		image_count: 0,
		web_search_count: 0,
		request_count: 0,
		ttft_ms: null,
		chunk_offsets: [],
		chunk_tokens: [],
		...costCols(EMPTY_BREAKDOWN),
		pricing_source: "",
		priced_at: null,
		trace_name: "",
		agent_name: "",
		workflow_name: "",
		workflow_run_id: "",
		session_id: "",
		metadata: {},
		input: "",
		output: "",
	};
}

type TraceCtx = {
	projectId: string;
	orgId: string;
	table: PricingTable;
	now: number;
	rows: SpanRow[];
};

/**
 * Build one trace: a root "agent" span plus the given child steps. Each LLM
 * step is priced; tool steps carry input/output but no cost.
 */
function makeTrace(
	c: TraceCtx,
	opts: {
		startedAgo: number; // ms before now the trace started
		traceName?: string;
		agentName?: string;
		workflowName?: string;
		workflowRunId?: string;
		sessionId?: string;
		models: string[]; // one llm step per entry
		tools?: string[]; // tool spans: interleaved after each step, extras appended
		withEmbedding?: boolean; // prepend an `embedding` span (RAG-style retrieval)
		error?: boolean;
		conversation?: Conversation; // long multi-turn input/output for llm steps
		metadata?: Record<string, string>;
	},
) {
	const traceId = uuidv7();
	const start = c.now - opts.startedAgo;
	const meta = opts.metadata ?? {};
	let cursor = start;
	const children: SpanRow[] = [];

	// A tool span (unpriced) advancing the cursor; used for agentic tool loops.
	const pushTool = (name: string) => {
		const tdur = rnd(80, 600);
		const tStart = cursor;
		const tEnd = tStart + tdur;
		cursor = tEnd;
		children.push({
			...emptyRow(c.projectId, c.orgId, tStart),
			trace_id: traceId,
			span_id: `${traceId}:tool:${uuidv7()}`,
			parent_span_id: `${traceId}:root`,
			span_type: "tool",
			name,
			start_time: tStart,
			end_time: tEnd,
			duration_ms: tdur,
			status: "ok",
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: JSON.stringify({ tool: name, args: { q: "foglamp" } }),
			output: JSON.stringify({ ok: true, results: rnd(1, 9) }),
		});
	};

	// Optional retrieval embedding before the first model step.
	if (opts.withEmbedding) {
		const edur = rnd(40, 300);
		const eStart = cursor;
		cursor = eStart + edur;
		const eInput = rnd(200, 2000);
		const ePriced = priceSpan({
			table: c.table,
			provider: "openai",
			modelId: EMBEDDING_MODEL,
			usage: {
				inputTokens: eInput,
				outputTokens: 0,
				totalTokens: eInput,
				reasoningTokens: 0,
				cachedInputTokens: 0,
				cacheWriteInputTokens: 0,
				imageCount: 0,
				webSearchCount: 0,
				requestCount: 1,
			},
		});
		children.push({
			...emptyRow(c.projectId, c.orgId, eStart),
			trace_id: traceId,
			span_id: `${traceId}:embed`,
			parent_span_id: `${traceId}:root`,
			span_type: "embedding",
			name: `embed (${EMBEDDING_MODEL})`,
			start_time: eStart,
			end_time: cursor,
			duration_ms: edur,
			status: "ok",
			provider: "openai",
			model_id: EMBEDDING_MODEL,
			priced_model_id: ePriced.resolvedId,
			input_tokens: eInput,
			total_tokens: eInput,
			request_count: 1,
			...costCols(ePriced.costs),
			pricing_source: ePriced.source ?? "",
			priced_at: ePriced.source ? c.now : null,
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: JSON.stringify(["chunk to embed"]),
			output: "",
		});
	}

	const convo = opts.conversation;
	let stepIndex = 0;
	for (const modelId of opts.models) {
		const provider = modelId.split("/")[0]!;
		// Long conversations carry far more context (system prompt + retrieved
		// docs + many turns), so scale token counts up to match the payload.
		const inputTokens = convo ? rnd(2400, 14000) : rnd(400, 3200);
		const outputTokens = convo ? rnd(350, 2400) : rnd(80, 900);
		const cachedInputTokens = Math.random() < 0.5 ? rnd(0, inputTokens) : 0;
		const usage = {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			reasoningTokens: 0,
			cachedInputTokens,
			cacheWriteInputTokens: 0,
			imageCount: 0,
			webSearchCount: 0,
			requestCount: 1,
		};
		const priced = priceSpan({ table: c.table, provider, modelId, usage });
		const dur = rnd(300, 4000);
		const stepStart = cursor;
		const stepEnd = stepStart + dur;
		cursor = stepEnd;
		const isLastStep = stepIndex === opts.models.length - 1;
		const stepErr = opts.error === true && isLastStep;
		const ttft = Math.round(dur * (0.25 + Math.random() * 0.4));
		const chunks = stepErr
			? { offsets: [], tokens: [] }
			: synthChunks(ttft, dur, usage.outputTokens);

		children.push({
			...emptyRow(c.projectId, c.orgId, stepStart),
			trace_id: traceId,
			span_id: `${traceId}:step:${stepIndex}`,
			parent_span_id: `${traceId}:root`,
			span_type: "llm",
			name: `generate (${modelId})`,
			start_time: stepStart,
			end_time: stepEnd,
			duration_ms: dur,
			status: stepErr ? "error" : "ok",
			error_message: stepErr ? "Upstream model returned 529 (overloaded)" : "",
			provider,
			model_id: modelId,
			priced_model_id: priced.resolvedId,
			input_tokens: usage.inputTokens,
			output_tokens: usage.outputTokens,
			total_tokens: usage.totalTokens,
			cached_input_tokens: usage.cachedInputTokens,
			request_count: 1,
			ttft_ms: ttft,
			chunk_offsets: chunks.offsets,
			chunk_tokens: chunks.tokens,
			...costCols(priced.costs),
			pricing_source: priced.source ?? "",
			priced_at: priced.source ? c.now : null,
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: convo
				? JSON.stringify(convo.messages)
				: JSON.stringify([{ role: "user", content: "What is Foglamp?" }]),
			output: stepErr
				? ""
				: convo
					? convo.reply
					: "Foglamp is an observability platform for AI agents.",
		});
		stepIndex += 1;

		// Interleave a tool call after this step (model → tool → model → tool …).
		const tool = opts.tools?.[stepIndex - 1];
		if (tool) pushTool(tool);
	}

	// Any tools beyond the step count fire after the last step (tool-heavy loop).
	if (opts.tools) {
		for (let i = opts.models.length; i < opts.tools.length; i += 1) {
			pushTool(opts.tools[i]!);
		}
	}

	const end = cursor;
	// Root agent span spans the whole trace; it is unpriced (cost lives on llm
	// spans to avoid double-counting in the rollups).
	c.rows.push({
		...emptyRow(c.projectId, c.orgId, start),
		trace_id: traceId,
		span_id: `${traceId}:root`,
		parent_span_id: "",
		span_type: "agent",
		name: opts.traceName ?? opts.agentName ?? "generateText",
		start_time: start,
		end_time: end,
		duration_ms: end - start,
		status: opts.error ? "error" : "ok",
		trace_name: opts.traceName ?? "",
		agent_name: opts.agentName ?? "",
		workflow_name: opts.workflowName ?? "",
		workflow_run_id: opts.workflowRunId ?? "",
		session_id: opts.sessionId ?? "",
		metadata: meta,
	});
	c.rows.push(...children);
	return traceId;
}

const DAY_MS = 24 * 60 * 60_000;

// mega dataset: 400+ traces across the last 2 weeks. Builds clustered workflow
// runs (members ordered in time around the run start) plus a long tail of
// standalone agents and named one-off calls, with long conversations, tool
// loops, embeddings, and errors mixed throughout.
function buildMega(c: TraceCtx, models: string[]) {
	const SPAN_MS = 14 * DAY_MS; // 2 weeks
	const agents = [
		"support-bot",
		"researcher",
		"summarizer",
		"classifier",
		"router",
		"sql-analyst",
		"code-reviewer",
		"doc-qa",
	];
	const oneOffNames = [
		"summarize-email",
		"classify-ticket",
		"extract-entities",
		"translate-doc",
		"moderate-content",
		"generate-title",
		"detect-language",
		"rerank-results",
	];
	// A handful of distinct workflows, each a sequence of steps. Early steps are
	// agents; the trailing steps are plain named one-offs in the same run.
	const workflowDefs = [
		{
			name: "nightly-digest",
			steps: [
				{ kind: "agent", name: "retriever", embed: true, tools: ["vector_search"] },
				{ kind: "agent", name: "summarizer", convo: true },
				{ kind: "agent", name: "writer" },
				{ kind: "named", name: "fetch-sources", tools: ["fetch_url", "fetch_url"] },
				{ kind: "named", name: "publish-digest", tools: ["send_email"] },
			],
		},
		{
			name: "ticket-triage",
			steps: [
				{ kind: "agent", name: "classifier", convo: true },
				{ kind: "agent", name: "router", tools: ["query_db"] },
				{ kind: "named", name: "draft-reply", convo: true },
			],
		},
		{
			name: "doc-pipeline",
			steps: [
				{ kind: "named", name: "chunk-doc" },
				{ kind: "agent", name: "embedder", embed: true },
				{ kind: "named", name: "index-chunks", tools: ["vector_search", "query_db"] },
				{ kind: "agent", name: "doc-qa", convo: true, embed: true },
			],
		},
		{
			name: "code-review-bot",
			steps: [
				{ kind: "agent", name: "code-reviewer", convo: true, tools: ["read_file", "run_code"] },
				{ kind: "named", name: "post-comment", tools: ["send_email"] },
			],
		},
	] as const;

	const sessions = Array.from(
		{ length: 10 },
		() => `sess_${uuidv7().slice(0, 8)}`,
	);

	// ~36 workflow runs sprinkled across the 2 weeks → ~140 workflow traces.
	const NUM_RUNS = 36;
	for (let r = 0; r < NUM_RUNS; r += 1) {
		const def = workflowDefs[r % workflowDefs.length]!;
		const runId = `run_${uuidv7()}`;
		const sessionId = pick(sessions);
		// When this run kicked off (ms ago); leave headroom so later steps stay in
		// the past after we advance them forward in time.
		const runStartedAgo = rnd(2 * 60_000, SPAN_MS);
		def.steps.forEach((step, idx) => {
			// Steps progress forward in time → smaller startedAgo as idx grows.
			const startedAgo = Math.max(
				30_000,
				runStartedAgo - idx * rnd(3_000, 45_000),
			);
			makeTrace(c, {
				startedAgo,
				traceName: step.kind === "named" ? step.name : undefined,
				agentName: step.kind === "agent" ? step.name : undefined,
				workflowName: def.name,
				workflowRunId: runId,
				sessionId,
				models: Array.from({ length: rnd(1, "convo" in step && step.convo ? 4 : 3) }, () =>
					pick(models),
				),
				tools: "tools" in step ? [...step.tools] : undefined,
				withEmbedding: "embed" in step ? step.embed : false,
				conversation: "convo" in step && step.convo ? pick(CONVERSATIONS) : undefined,
				// ~1 in 12 runs has a failing final step.
				error: idx === def.steps.length - 1 && r % 12 === 0,
				metadata: {
					env: "production",
					scenario: "mega",
					workflow: def.name,
					step: String(idx + 1),
				},
			});
		});
	}

	// Long tail of standalone traces to push the dataset past 400. Mix of
	// long-conversation agents, plain agents, named one-offs, and tool loops.
	const STANDALONE = 300;
	for (let i = 0; i < STANDALONE; i += 1) {
		const startedAgo = rnd(60_000, SPAN_MS);
		const named = i % 3 === 0;
		const longConvo = i % 4 === 0; // a quarter carry full chat histories
		const toolCount = i % 5 === 0 ? rnd(2, 8) : i % 2 === 0 ? 1 : 0;
		// A few traces share a session to exercise session grouping.
		const sessionId = i % 7 === 0 ? pick(sessions) : undefined;
		makeTrace(c, {
			startedAgo,
			traceName: named ? pick(oneOffNames) : undefined,
			agentName: named ? undefined : pick(agents),
			sessionId,
			models: Array.from({ length: rnd(1, longConvo ? 5 : 4) }, () =>
				pick(models),
			),
			tools:
				toolCount > 0
					? Array.from({ length: toolCount }, () => pick(TOOL_NAMES))
					: undefined,
			withEmbedding: i % 6 === 0,
			conversation: longConvo ? pick(CONVERSATIONS) : undefined,
			error: i % 11 === 0,
			metadata: { env: "production", scenario: "mega" },
		});
	}
}

function buildRows(
	projectId: string,
	orgId: string,
	kind: TestKind,
	table: PricingTable,
) {
	const now = Date.now();
	const c: TraceCtx = { projectId, orgId, table, now, rows: [] };
	const models = pickModels(table);

	if (kind === "bare") {
		// A plain named trace (one-off call): traceName, no agent classification.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			traceName: "summarize-email",
			models: [models[0]!],
			metadata: { env: "test", scenario: "named" },
		});
	} else if (kind === "agent") {
		// A RAG-style agent: retrieval embedding → step → tool → step.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			agentName: "support-bot",
			models: [pick(models), pick(models)],
			withEmbedding: true,
			tools: ["query_db"],
			metadata: { env: "test", scenario: "agent" },
		});
	} else if (kind === "workflow") {
		// One run grouping multiple agents AND plain named one-off traces — with an
		// embedding, tools, and an errored step for good measure.
		const runId = `run_${uuidv7()}`;
		const sessionId = `sess_${uuidv7().slice(0, 8)}`;
		makeTrace(c, {
			startedAgo: 180_000,
			agentName: "retriever",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			withEmbedding: true,
			tools: ["vector_search"],
			metadata: { env: "test", scenario: "workflow", step: "1" },
		});
		makeTrace(c, {
			startedAgo: 150_000,
			agentName: "summarizer",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models), pick(models)],
			metadata: { env: "test", scenario: "workflow", step: "2" },
		});
		makeTrace(c, {
			startedAgo: 120_000,
			agentName: "writer",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			error: true,
			metadata: { env: "test", scenario: "workflow", step: "3" },
		});
		// Plain named traces (no agent) in the SAME run — workflows group both.
		makeTrace(c, {
			startedAgo: 90_000,
			traceName: "fetch-sources",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			tools: ["fetch_url", "fetch_url"],
			metadata: { env: "test", scenario: "workflow", step: "4" },
		});
		makeTrace(c, {
			startedAgo: 60_000,
			traceName: "publish-digest",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			tools: ["send_email"],
			metadata: { env: "test", scenario: "workflow", step: "5" },
		});
	} else if (kind === "tool") {
		// A tool-heavy agent: many tool calls interleaved with reasoning steps.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			agentName: "researcher",
			models: [pick(models), pick(models), pick(models)],
			withEmbedding: true,
			tools: [
				"web_search",
				"fetch_url",
				"query_db",
				"run_code",
				"read_file",
				"calculator",
			],
			metadata: { env: "test", scenario: "tool" },
		});
	} else if (kind === "full") {
		// full: a broad spread over the last ~60 min so every chart, span type,
		// grouping, and status has shape — agents, named one-offs, tool loops,
		// embeddings, errors, multiple workflow runs and sessions.
		const agents = [
			"support-bot",
			"researcher",
			"summarizer",
			"classifier",
			"router",
		];
		const oneOffNames = [
			"summarize-email",
			"classify-ticket",
			"extract-entities",
			"translate-doc",
			"moderate-content",
		];
		const runs = [`run_${uuidv7()}`, `run_${uuidv7()}`, `run_${uuidv7()}`];
		const sessions = [
			`sess_${uuidv7().slice(0, 8)}`,
			`sess_${uuidv7().slice(0, 8)}`,
		];
		for (let i = 0; i < 42; i += 1) {
			const startedAgo = rnd(10_000, 60 * 60_000);
			const inWorkflow = i % 4 === 0;
			// Some traces are plain named one-offs (standalone and inside workflows).
			const named = i % 3 === 0;
			const toolCount = i % 5 === 0 ? rnd(2, 7) : i % 2 === 0 ? 1 : 0;
			makeTrace(c, {
				startedAgo,
				traceName: named ? pick(oneOffNames) : undefined,
				agentName: named ? undefined : pick(agents),
				workflowName: inWorkflow ? "nightly-digest" : undefined,
				workflowRunId: inWorkflow ? pick(runs) : undefined,
				sessionId: inWorkflow
					? pick(sessions)
					: i % 6 === 0
						? pick(sessions)
						: undefined,
				models: Array.from({ length: rnd(1, 4) }, () => pick(models)),
				tools:
					toolCount > 0
						? Array.from({ length: toolCount }, () => pick(TOOL_NAMES))
						: undefined,
				withEmbedding: i % 7 === 0,
				error: i % 9 === 0,
				metadata: { env: "test", scenario: "full" },
			});
		}
	} else {
		// mega: a large, realistic 2-week dataset — 400+ traces spread across the
		// last 14 days, mixing long multi-turn conversations, tool-heavy loops,
		// embeddings, errors, and many workflow runs/sessions. Workflow members
		// cluster in time around each run's start so runs read as coherent.
		buildMega(c, models);
	}

	const traceIds = new Set(c.rows.map((r) => r.trace_id));
	return { rows: c.rows, traces: traceIds.size, spans: c.rows.length };
}

/** Generate + insert synthetic spans for a project. */
export async function ingestTest(
	ch: Ch,
	db: Db,
	userId: string,
	input: { projectId: string; kind: TestKind },
) {
	const proj = await requireProjectAccess(db, userId, input.projectId);
	const table = await getPricingTable();
	const { rows, traces, spans } = buildRows(
		input.projectId,
		proj.orgId,
		input.kind,
		table,
	);
	await insertSpans(ch, rows);
	const scores = await seedEvalsAndScores(db, ch, input.projectId, rows);
	return { kind: input.kind, traces, spans, scores };
}

// Find-or-create a demo eval (idempotent across admin runs) → returns its id.
async function ensureEval(
	db: Db,
	projectId: string,
	def: {
		name: string;
		presetId: string;
		scorerSource: "code" | "llm";
		targetLevel: "trace" | "span";
		model?: { provider: "google" | "openai" | "anthropic"; modelId: string };
	},
): Promise<string> {
	const existing = await db
		.select({ id: evalDefinition.id })
		.from(evalDefinition)
		.where(
			and(
				eq(evalDefinition.projectId, projectId),
				eq(evalDefinition.presetId, def.presetId),
			),
		)
		.limit(1);
	if (existing[0]) return existing[0].id;
	const ins = await db
		.insert(evalDefinition)
		.values({
			projectId,
			name: def.name,
			presetId: def.presetId,
			scorerSource: def.scorerSource,
			targetLevel: def.targetLevel,
			sampleRate: "1",
			model: def.model ?? null,
			enabled: true,
		})
		.returning({ id: evalDefinition.id });
	const id = ins[0]!.id;
	await db.insert(evalState).values({ evalId: id, status: "ok" });
	return id;
}

const RELEVANCE_REASONS = [
	"Directly answers the question.",
	"Mostly relevant, minor digression.",
	"On-topic and complete.",
	"Partially addresses the request.",
];

// Seed two demo evals (a trace-level relevance judge + a span-level PII check)
// and synthetic scores over the just-generated spans, so the Evals UI, score
// badges, and charts render immediately without waiting for the worker.
async function seedEvalsAndScores(
	db: Db,
	ch: Ch,
	projectId: string,
	rows: SpanRow[],
): Promise<number> {
	const relevanceId = await ensureEval(db, projectId, {
		name: "Answer relevance",
		presetId: "relevance",
		scorerSource: "llm",
		targetLevel: "trace",
		model: { provider: "google", modelId: "gemini-3.1-flash-lite" },
	});
	const piiId = await ensureEval(db, projectId, {
		name: "No PII in output",
		presetId: "pii",
		scorerSource: "code",
		targetLevel: "span",
	});

	const scores: ScoreRow[] = [];
	for (const r of rows) {
		if (r.span_type === "agent") {
			const score = rnd(3, 6); // 3–5
			scores.push({
				project_id: projectId,
				eval_id: relevanceId,
				score_id: `${relevanceId}:${r.trace_id}`,
				target_type: "trace",
				target_id: r.trace_id,
				trace_id: r.trace_id,
				scorer: "llm",
				label: "",
				score,
				passed: null,
				reason: pick(RELEVANCE_REASONS),
				model_id: "gemini-3.1-flash-lite",
				cost: "0.0000200000",
				scored_at: r.end_time + 800,
			});
		} else if (r.span_type === "llm") {
			const leaked = Math.random() < 0.05;
			scores.push({
				project_id: projectId,
				eval_id: piiId,
				score_id: `${piiId}:${r.span_id}`,
				target_type: "span",
				target_id: r.span_id,
				trace_id: r.trace_id,
				scorer: "code",
				label: "",
				score: null,
				passed: leaked ? 0 : 1,
				reason: leaked ? "Found PII: email" : "No PII detected",
				model_id: "",
				cost: null,
				scored_at: r.end_time + 400,
			});
		}
	}
	await insertScores(ch, scores);
	return scores.length;
}

export type PricedModelRow = {
	id: string;
	prompt: string | null;
	completion: string | null;
	request: string | null;
	cacheRead: string | null;
	cacheWrite: string | null;
	image: string | null;
	webSearch: string | null;
	internalReasoning: string | null;
};

/**
 * The OpenRouter pricing currently cached in-process — the same table ingest
 * uses to price spans. Per-token prices for the common dimensions.
 */
export async function listPricing(): Promise<{
	count: number;
	models: PricedModelRow[];
}> {
	const table = await getPricingTable();
	const models: PricedModelRow[] = [];
	for (const [id, price] of table.entries()) {
		models.push({
			id,
			prompt: price.prompt,
			completion: price.completion,
			request: price.request,
			cacheRead: price.cacheRead,
			cacheWrite: price.cacheWrite,
			image: price.image,
			webSearch: price.webSearch,
			internalReasoning: price.internalReasoning,
		});
	}
	models.sort((a, b) => a.id.localeCompare(b.id));
	return { count: models.length, models };
}

// --- Transactional email preview/test harness (dev-only) ---------------------
// Each entry maps to one of the platform's transactional emails, fired with
// mocked-but-realistic data so the actual templates can be exercised against a
// real inbox. Like the data generator above, the surfacing UI is dev-gated; the
// procedure additionally refuses to run in production so a reachable prod server
// can't be used to send arbitrary mail.

export const TEST_EMAILS = [
	"magic-link",
	"invitation",
	"quota-warning",
	"alert-fired",
	"alert-resolved",
] as const;
export type TestEmail = (typeof TEST_EMAILS)[number];

/** Send one of the platform's emails to `to`, populated with mocked data. */
export async function sendTestEmail(input: { kind: TestEmail; to: string }) {
	if (env.NODE_ENV === "production") {
		throw new Error("Test emails are disabled in production.");
	}
	// The web origin — drives the links inside each template.
	const base = env.CORS_ORIGIN.replace(/\/$/, "");

	switch (input.kind) {
		case "magic-link":
			await sendMagicLinkEmail({
				to: input.to,
				url: `${base}/api/auth/magic-link/verify?token=mock-magic-link-token`,
			});
			break;
		case "invitation":
			await sendInvitationEmail({
				to: input.to,
				inviterName: "Ada Lovelace",
				orgName: "Acme Cloud",
				url: `${base}/accept-invitation/mock-invitation-id`,
			});
			break;
		case "quota-warning":
			await sendQuotaWarningEmail({
				to: input.to,
				orgName: "Acme Cloud",
				pct: 92,
				url: `${base}/settings/org`,
			});
			break;
		case "alert-fired":
			await sendAlertEmail({
				to: input.to,
				kind: "fired",
				ruleName: "p99 latency too high",
				projectName: "production",
				metricLabel: "p99 latency",
				conditionLabel: "above 1,500 ms",
				value: "2,310 ms",
				windowLabel: "last 5 minutes",
				url: `${base}/alerts`,
			});
			break;
		case "alert-resolved":
			await sendAlertEmail({
				to: input.to,
				kind: "resolved",
				ruleName: "p99 latency too high",
				projectName: "production",
				metricLabel: "p99 latency",
				conditionLabel: "above 1,500 ms",
				value: "840 ms",
				windowLabel: "last 5 minutes",
				url: `${base}/alerts`,
			});
			break;
	}

	// The senders silently no-op without a Resend key (email-less self-host), so
	// report whether mail was actually dispatched vs. skipped.
	return {
		kind: input.kind,
		to: input.to,
		delivered: Boolean(env.RESEND_API_KEY),
	};
}
