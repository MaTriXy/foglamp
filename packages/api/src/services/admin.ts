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
import { getPricingTable } from "@foglamp/cost";
import {
	type AlertFilters,
	alertEvent,
	alertRule,
	alertState,
} from "@foglamp/db/schema/alert";
import {
	type EvalConfig,
	type EvalFilters,
	type EvalModel,
	evalDefinition,
	evalJob,
	evalState,
} from "@foglamp/db/schema/eval";
import { member } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { env } from "@foglamp/env/server";
import { and, desc, eq, sql } from "drizzle-orm";

import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";
import { type TestKind, TEST_KINDS, buildRows } from "./testData";

export { TEST_KINDS };
export type { TestKind };

const rnd = (min: number, max: number) =>
	Math.floor(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length)]!;

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
	const scores =
		input.kind === "ultra"
			? await seedUltraExtras(db, ch, input.projectId, rows)
			: await seedEvalsAndScores(db, ch, input.projectId, rows);
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
		model?: EvalModel;
		sampleRate?: string;
		filters?: EvalFilters;
		config?: EvalConfig;
		enabled?: boolean;
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
			sampleRate: def.sampleRate ?? "1",
			model: def.model ?? null,
			filters: def.filters ?? null,
			config: def.config ?? null,
			enabled: def.enabled ?? true,
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

// Judge models rotated across the ultra eval suite (one credential per provider
// in a real project; here they just populate model_id / cost on score rows).
const ULTRA_JUDGES = [
	"google/gemini-3.1-flash-lite",
	"openai/gpt-5.5-mini",
	"anthropic/claude-haiku-4.5",
];

function judgeModel(id: string): EvalModel {
	const [provider, ...rest] = id.split("/");
	return {
		provider: provider as EvalModel["provider"],
		modelId: rest.join("/"),
	};
}

const ULTRA_SCORE_REASONS = [
	"Grounded in the provided context with no unsupported claims.",
	"Fully addresses every part of the request.",
	"Clear, well-structured, and internally consistent.",
	"Follows the instructions precisely.",
	"Minor omission but largely complete.",
	"Slightly verbose, otherwise on point.",
];

// Find-or-create a demo alert rule (idempotent by name) and seed its state +
// a couple of history events so the Alerts UI renders firing/resolved rows.
async function ensureAlert(
	db: Db,
	projectId: string,
	now: number,
	def: {
		name: string;
		metric: (typeof alertRule.$inferInsert)["metric"];
		comparison: (typeof alertRule.$inferInsert)["comparison"];
		threshold: string;
		windowSeconds: number;
		lastValue: string;
		status: "ok" | "firing";
		evalId?: string;
		filters?: AlertFilters;
	},
): Promise<string> {
	const existing = await db
		.select({ id: alertRule.id })
		.from(alertRule)
		.where(and(eq(alertRule.projectId, projectId), eq(alertRule.name, def.name)))
		.limit(1);
	let ruleId = existing[0]?.id;
	if (!ruleId) {
		const ins = await db
			.insert(alertRule)
			.values({
				projectId,
				name: def.name,
				metric: def.metric,
				evalId: def.evalId ?? null,
				filters: def.filters ?? null,
				windowSeconds: def.windowSeconds,
				threshold: def.threshold,
				comparison: def.comparison,
				enabled: true,
				channels: [{ type: "email", to: "alerts@foglamp.dev" }],
			})
			.returning({ id: alertRule.id });
		ruleId = ins[0]!.id;
	}

	const firing = def.status === "firing";
	const evaluatedAt = new Date(now - 60_000);
	const firedAt = new Date(now - 3 * 60 * 60 * 1000);
	await db
		.insert(alertState)
		.values({
			ruleId,
			status: def.status,
			lastValue: def.lastValue,
			lastEvaluatedAt: evaluatedAt,
			lastFiredAt: firing ? evaluatedAt : firedAt,
			lastNotifiedAt: firing ? evaluatedAt : firedAt,
		})
		.onConflictDoNothing();

	// A fired→resolved pair in the past, plus an open `fired` when still firing.
	const events: (typeof alertEvent.$inferInsert)[] = [
		{
			ruleId,
			type: "fired",
			value: def.lastValue,
			threshold: def.threshold,
			createdAt: firedAt,
		},
		{
			ruleId,
			type: "resolved",
			value: def.threshold,
			threshold: def.threshold,
			createdAt: new Date(now - 2 * 60 * 60 * 1000),
		},
	];
	if (firing) {
		events.push({
			ruleId,
			type: "fired",
			value: def.lastValue,
			threshold: def.threshold,
			createdAt: evaluatedAt,
		});
	}
	await db.insert(alertEvent).values(events);
	return ruleId;
}

// The ultra dataset's full observability layer: a 14-scorer eval suite spanning
// every preset family (self-contained judges, RAG/reference judges, and code
// checks at both trace and span level), dense synthetic scores over the just-
// generated spans, and nine alert rules covering every metric — including two
// eval-score alerts wired to specific evals.
async function seedUltraExtras(
	db: Db,
	ch: Ch,
	projectId: string,
	rows: SpanRow[],
): Promise<number> {
	const j = (i: number) => ULTRA_JUDGES[i % ULTRA_JUDGES.length]!;

	// Trace-level LLM judges.
	const relevanceId = await ensureEval(db, projectId, { name: "Answer relevance", presetId: "relevance", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "1" });
	const helpfulnessId = await ensureEval(db, projectId, { name: "Helpfulness", presetId: "helpfulness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(1)), sampleRate: "0.8" });
	const faithfulnessId = await ensureEval(db, projectId, { name: "Faithfulness (RAG)", presetId: "faithfulness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(2)), sampleRate: "0.6" });
	const coherenceId = await ensureEval(db, projectId, { name: "Coherence", presetId: "coherence", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "0.7" });
	const completenessId = await ensureEval(db, projectId, { name: "Completeness", presetId: "completeness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(1)), sampleRate: "0.7" });
	const instructionId = await ensureEval(db, projectId, { name: "Instruction following", presetId: "instruction_following", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(2)), sampleRate: "0.8" });
	const correctnessId = await ensureEval(db, projectId, { name: "Correctness vs reference", presetId: "correctness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "1", filters: { metadata: { has_reference: "1" } } });

	// Span-level checks: one LLM safety judge + four code scorers + two tool evals.
	const toxicityId = await ensureEval(db, projectId, { name: "Toxicity / safety", presetId: "toxicity", scorerSource: "llm", targetLevel: "span", model: judgeModel(j(1)), sampleRate: "0.5", filters: { spanType: "llm" } });
	const piiId = await ensureEval(db, projectId, { name: "No PII in output", presetId: "pii", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const validJsonId = await ensureEval(db, projectId, { name: "Valid JSON", presetId: "valid_json", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const noRefusalId = await ensureEval(db, projectId, { name: "No refusal", presetId: "no_refusal", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const secretLeakId = await ensureEval(db, projectId, { name: "No secret leak", presetId: "secret_leak", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const toolSelectionId = await ensureEval(db, projectId, { name: "Tool selection", presetId: "tool_selection", scorerSource: "llm", targetLevel: "span", model: judgeModel(j(2)), sampleRate: "0.6", filters: { spanType: "tool" } });
	const toolArgsId = await ensureEval(db, projectId, { name: "Tool args valid", presetId: "tool_args_valid", scorerSource: "code", targetLevel: "span", filters: { spanType: "tool" } });

	const scores: ScoreRow[] = [];
	const pushJudge = (
		evalId: string,
		r: SpanRow,
		model: string,
		opts: { score?: number; passed?: 0 | 1 } = {},
	) => {
		scores.push({
			project_id: projectId,
			eval_id: evalId,
			score_id: `${evalId}:${r.span_id}`,
			target_type: "trace",
			target_id: r.trace_id,
			trace_id: r.trace_id,
			scorer: "llm",
			label: "",
			score: opts.score ?? null,
			passed: opts.passed ?? null,
			reason: pick(ULTRA_SCORE_REASONS),
			model_id: judgeModel(model).modelId,
			cost: "0.0000180000",
			scored_at: r.end_time + 700,
		});
	};
	const pushCode = (
		evalId: string,
		r: SpanRow,
		passed: 0 | 1,
		reason: string,
	) => {
		scores.push({
			project_id: projectId,
			eval_id: evalId,
			score_id: `${evalId}:${r.span_id}`,
			target_type: "span",
			target_id: r.span_id,
			trace_id: r.trace_id,
			scorer: "code",
			label: "",
			score: null,
			passed,
			reason,
			model_id: "",
			cost: null,
			scored_at: r.end_time + 300,
		});
	};

	let idx = 0;
	for (const r of rows) {
		idx += 1;
		if (r.span_type === "agent") {
			pushJudge(relevanceId, r, j(0), { score: rnd(3, 6) });
			if (idx % 5 !== 0) pushJudge(helpfulnessId, r, j(1), { score: rnd(3, 6) });
			if (idx % 3 === 0) pushJudge(faithfulnessId, r, j(2), { score: rnd(2, 6) });
			if (idx % 4 !== 0) pushJudge(coherenceId, r, j(0), { score: rnd(4, 6) });
			if (idx % 4 !== 0) pushJudge(completenessId, r, j(1), { score: rnd(3, 6) });
			if (idx % 5 !== 0) pushJudge(instructionId, r, j(2), { score: rnd(3, 6) });
			if (r.metadata.reference) {
				const ok = Math.random() < 0.8;
				pushJudge(correctnessId, r, j(0), { score: ok ? rnd(4, 6) : rnd(1, 3), passed: ok ? 1 : 0 });
			}
		} else if (r.span_type === "llm") {
			const leaked = Math.random() < 0.04;
			pushCode(piiId, r, leaked ? 0 : 1, leaked ? "Found PII: email" : "No PII detected");
			const isJson = r.output.trim().startsWith("{") || r.output.trim().startsWith("[");
			pushCode(validJsonId, r, isJson ? 1 : 0, isJson ? "Parsed as JSON" : "Not JSON output");
			const refused = Math.random() < 0.03;
			pushCode(noRefusalId, r, refused ? 0 : 1, refused ? "Looks like a refusal" : "Not a refusal");
			const secret = Math.random() < 0.02;
			pushCode(secretLeakId, r, secret ? 0 : 1, secret ? "Token-shaped string detected" : "No secrets detected");
			if (idx % 2 === 0) {
				const safe = Math.random() < 0.99;
				pushJudge(toxicityId, r, j(1), { passed: safe ? 1 : 0 });
				// Toxicity is span-targeted, so rewrite the last row's target.
				const last = scores[scores.length - 1]!;
				last.target_type = "span";
				last.target_id = r.span_id;
			}
		} else if (r.span_type === "tool") {
			if (idx % 3 !== 0) {
				scores.push({
					project_id: projectId,
					eval_id: toolSelectionId,
					score_id: `${toolSelectionId}:${r.span_id}`,
					target_type: "span",
					target_id: r.span_id,
					trace_id: r.trace_id,
					scorer: "llm",
					label: "",
					score: rnd(3, 6),
					passed: null,
					reason: "Appropriate tool for the request.",
					model_id: judgeModel(j(2)).modelId,
					cost: "0.0000150000",
					scored_at: r.end_time + 300,
				});
			}
			const valid = Math.random() < 0.97;
			pushCode(toolArgsId, r, valid ? 1 : 0, valid ? "Args are a valid JSON object" : "Args failed to parse");
		}
	}
	await insertScores(ch, scores);

	// Nine alert rules — every metric, two of them eval-scoped.
	const now = rows.length ? Math.max(...rows.map((r) => r.end_time)) : Date.now();
	await ensureAlert(db, projectId, now, { name: "Hourly spend over budget", metric: "cost", comparison: "gt", threshold: "25.0000000000", windowSeconds: 3600, lastValue: "31.4200000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "p95 latency SLO", metric: "latency_p95", comparison: "gt", threshold: "8000.0000000000", windowSeconds: 900, lastValue: "6450.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "p99 latency ceiling", metric: "latency_p99", comparison: "gt", threshold: "15000.0000000000", windowSeconds: 900, lastValue: "17200.0000000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "Time-to-first-token p95", metric: "ttft_p95", comparison: "gt", threshold: "2500.0000000000", windowSeconds: 900, lastValue: "1980.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Error rate spike", metric: "error_rate", comparison: "gt", threshold: "0.0500000000", windowSeconds: 600, lastValue: "0.1100000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "Token usage surge", metric: "token_usage", comparison: "gt", threshold: "5000000.0000000000", windowSeconds: 3600, lastValue: "4100000.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Request volume guard", metric: "request_count", comparison: "gt", threshold: "10000.0000000000", windowSeconds: 3600, lastValue: "7300.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Relevance score dropped", metric: "eval_avg_score", comparison: "lt", threshold: "3.5000000000", windowSeconds: 86400, lastValue: "3.1000000000", status: "firing", evalId: relevanceId });
	await ensureAlert(db, projectId, now, { name: "PII pass-rate dropped", metric: "eval_pass_rate", comparison: "lt", threshold: "0.9500000000", windowSeconds: 86400, lastValue: "0.9700000000", status: "ok", evalId: piiId });

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

// --- Eval job queue observability --------------------------------------------

export type EvalJobRow = {
	id: string;
	evalId: string;
	evalName: string;
	projectName: string;
	windowStart: Date;
	windowEnd: Date;
	status: "pending" | "running" | "done" | "dead";
	attempts: number;
	maxAttempts: number;
	leasedUntil: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Snapshot of the eval scoring queue (`eval_job`): per-status counts plus the
 * 50 most recent jobs, joined with the eval + project for display. Surfaced on
 * the Admin tab to watch the planner/executor pipeline. Scoped to evals in
 * organizations the caller is a member of — the procedure is reachable by any
 * authenticated user, so an unscoped query would leak other orgs' eval and
 * project names.
 */
export async function listEvalJobs(
	db: Db,
	userId: string,
): Promise<{
	counts: Record<"pending" | "running" | "done" | "dead", number>;
	jobs: EvalJobRow[];
}> {
	const countRows = await db
		.select({
			status: evalJob.status,
			count: sql<number>`count(*)::int`,
		})
		.from(evalJob)
		.innerJoin(evalDefinition, eq(evalDefinition.id, evalJob.evalId))
		.innerJoin(project, eq(project.id, evalDefinition.projectId))
		.innerJoin(
			member,
			and(eq(member.organizationId, project.orgId), eq(member.userId, userId)),
		)
		.groupBy(evalJob.status);
	const counts = { pending: 0, running: 0, done: 0, dead: 0 };
	for (const row of countRows) counts[row.status] = row.count;

	const jobs = await db
		.select({
			id: evalJob.id,
			evalId: evalJob.evalId,
			evalName: evalDefinition.name,
			projectName: project.name,
			windowStart: evalJob.windowStart,
			windowEnd: evalJob.windowEnd,
			status: evalJob.status,
			attempts: evalJob.attempts,
			maxAttempts: evalJob.maxAttempts,
			leasedUntil: evalJob.leasedUntil,
			lastError: evalJob.lastError,
			createdAt: evalJob.createdAt,
			updatedAt: evalJob.updatedAt,
		})
		.from(evalJob)
		.innerJoin(evalDefinition, eq(evalDefinition.id, evalJob.evalId))
		.innerJoin(project, eq(project.id, evalDefinition.projectId))
		.innerJoin(
			member,
			and(eq(member.organizationId, project.orgId), eq(member.userId, userId)),
		)
		.orderBy(desc(evalJob.createdAt))
		.limit(50);

	return { counts, jobs };
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
