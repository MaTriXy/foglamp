import { runCodeScorer } from "../src/evals/codeScorers";
import { buildContext } from "../src/evals/context";
import {
	buildJudgeSchema,
	parseJudgeObject,
	renderPrompt,
} from "../src/evals/judge";
import { getPreset } from "../src/evals/presets";
import type { ScoringTarget } from "../src/evals/types";
// Standalone check for the evals scoring engine's pure pieces — encryption,
// code scorers, context extraction (incl. RAG sibling-context), and the judge
// schema/prompt/parse helpers. No live model, no DB. Run with the required env
// vars set (see the package.json script / invocation in the plan).
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

function assert(cond: unknown, msg: string): void {
	if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
	console.log(`  ✓ ${msg}`);
}

// --- Encryption round-trip + tamper detection ------------------------------
console.log("crypto (AES-256-GCM):");
const enc = encryptSecret("sk-super-secret-key-value");
assert(
	decryptSecret(enc) === "sk-super-secret-key-value",
	"encrypt → decrypt round-trips",
);
assert(
	enc.ciphertext !== "sk-super-secret-key-value",
	"ciphertext is not plaintext",
);
let tampered = false;
try {
	decryptSecret({
		...enc,
		authTag: Buffer.from("0".repeat(16)).toString("base64"),
	});
} catch {
	tampered = true;
}
assert(tampered, "tampered auth tag is rejected");

// --- Code scorers ----------------------------------------------------------
console.log("code scorers:");
const ctx = (output: string, input = "") => ({ input, output });
assert(
	runCodeScorer("pii", ctx("email me at a@b.com"), {}).passed === false,
	"pii flags email",
);
assert(
	runCodeScorer("pii", ctx("nothing here"), {}).passed === true,
	"pii passes clean text",
);
assert(
	runCodeScorer("valid_json", ctx('{"a":1}'), {}).passed === true,
	"valid_json accepts JSON",
);
assert(
	runCodeScorer("valid_json", ctx("not json"), {}).passed === false,
	"valid_json rejects non-JSON",
);
assert(
	runCodeScorer("no_refusal", ctx("I can't help with that"), {}).passed ===
		false,
	"no_refusal flags refusal",
);
assert(
	runCodeScorer("secret_leak", ctx("key sk-ABCDEFGHIJKLMNOPQRST"), {})
		.passed === false,
	"secret_leak flags token",
);
assert(
	runCodeScorer("max_length", ctx("abcdef"), { maxChars: 3 }).passed === false,
	"max_length enforces budget",
);
assert(
	runCodeScorer("tool_args_valid", ctx("", '{"q":"x"}'), {}).passed === true,
	"tool_args_valid accepts JSON object",
);

// --- Context extraction ----------------------------------------------------
console.log("context extraction:");
const relevance = getPreset("relevance")!;
const selfTarget: ScoringTarget = {
	level: "trace",
	targetId: "t1",
	traceId: "t1",
	spanType: "agent",
	startTimeMs: 1000,
	input: '"What is Foglamp?"',
	output: '"An observability platform."',
	metadata: {},
	siblings: [],
};
const selfCtx = buildContext(selfTarget, relevance);
assert(
	selfCtx.input === "What is Foglamp?" &&
		selfCtx.output === "An observability platform.",
	"humanizes JSON-string payloads",
);
assert(selfCtx.context === undefined, "no context for a self-contained preset");

const faithfulness = getPreset("faithfulness")!;
// Trace-level RAG: the target IS the root agent span, which starts first, so
// every retrieval/tool sibling runs AFTER it. All matching siblings are
// context — a start-time bound would (wrongly) drop them all.
const ragTarget: ScoringTarget = {
	level: "trace",
	targetId: "root",
	traceId: "t2",
	spanType: "agent",
	startTimeMs: 0,
	input: '"q"',
	output: '"grounded answer"',
	metadata: {},
	siblings: [
		{
			spanId: "e1",
			spanType: "embedding",
			output: '"retrieved chunk A"',
			startTimeMs: 1000,
		},
		{
			spanId: "t1",
			spanType: "tool",
			output: '"tool result B"',
			startTimeMs: 2000,
		},
		{
			spanId: "noise",
			spanType: "llm",
			output: '"not context"',
			startTimeMs: 3000,
		},
	],
};
const ragCtx = buildContext(ragTarget, faithfulness);
assert(
	ragCtx.context?.includes("retrieved chunk A") === true,
	"faithfulness pulls retrieved context from siblings",
);
assert(
	ragCtx.context?.includes("tool result B") === true,
	"context includes tool output from the trace",
);
assert(
	ragCtx.context?.includes("not context") === false,
	"context excludes non-retrieval span types",
);

// Span-level context keeps the time bound: only siblings that ran before the
// target span count as its retrieved context.
const spanRagTarget: ScoringTarget = {
	...ragTarget,
	level: "span",
	targetId: "mid",
	startTimeMs: 5000,
	siblings: [
		{
			spanId: "before",
			spanType: "tool",
			output: '"before target"',
			startTimeMs: 2000,
		},
		{
			spanId: "after",
			spanType: "tool",
			output: '"after target"',
			startTimeMs: 9000,
		},
	],
};
const spanRagCtx = buildContext(spanRagTarget, faithfulness);
assert(
	spanRagCtx.context?.includes("before target") === true,
	"span context includes preceding siblings",
);
assert(
	spanRagCtx.context?.includes("after target") === false,
	"span context excludes siblings after the target",
);

// tool_selection pulls the tool catalog from a sibling llm span (the candidate
// is a tool span, which carries no catalog of its own) into {tools}.
const toolSelection = getPreset("tool_selection")!;
const toolTarget: ScoringTarget = {
	level: "span",
	targetId: "call-1",
	traceId: "t4",
	spanType: "tool",
	startTimeMs: 2000,
	input: '"{\\"q\\":\\"weather\\"}"',
	output: '"sunny"',
	metadata: {},
	siblings: [
		{
			spanId: "step-0",
			spanType: "llm",
			output: '"calling search"',
			startTimeMs: 1000,
			toolCatalog: JSON.stringify({
				search_web: { description: "Search the web for a query." },
				send_email: { description: "Send an email to a recipient." },
			}),
		},
		{
			spanId: "call-1",
			spanType: "tool",
			output: '"sunny"',
			startTimeMs: 2000,
		},
	],
};
const toolCtx = buildContext(toolTarget, toolSelection);
assert(
	toolCtx.tools?.includes("search_web") === true,
	"tool_selection surfaces available tool names",
);
assert(
	toolCtx.tools?.includes("Send an email") === true,
	"tool catalog includes tool descriptions",
);
const toolPrompt = renderPrompt(toolSelection.prompt!, toolCtx);
assert(
	toolPrompt.includes("search_web") && !toolPrompt.includes("{tools}"),
	"renderPrompt substitutes {tools}",
);

// humanize flattens AI-SDK message/part arrays to readable text for the judge.
const msgTarget: ScoringTarget = {
	level: "trace",
	targetId: "m",
	traceId: "t3",
	spanType: "agent",
	startTimeMs: 0,
	input: JSON.stringify([
		{ role: "user", content: [{ type: "text", text: "ping" }] },
	]),
	output: JSON.stringify([{ type: "text", text: "pong" }]),
	metadata: {},
	siblings: [],
};
const msgCtx = buildContext(msgTarget, relevance);
assert(
	msgCtx.input.includes("ping") && !msgCtx.input.includes('"type"'),
	"humanizes message arrays to text",
);
assert(msgCtx.output.trim() === "pong", "humanizes bare part arrays to text");

// --- Judge pure helpers ----------------------------------------------------
console.log("judge helpers:");
const relSchema = buildJudgeSchema(relevance);
assert(
	relSchema.safeParse({ score: 0.8, reason: "ok" }).success,
	"relevance schema accepts a 0-1 {score, reason}",
);
assert(
	!relSchema.safeParse({ score: 4, reason: "ok" }).success,
	"relevance schema rejects out-of-range (>1) score",
);
assert(
	!relSchema.safeParse({ reason: "ok" }).success,
	"relevance schema requires score",
);
const toxicity = getPreset("toxicity")!;
const toxSchema = buildJudgeSchema(toxicity);
assert(
	toxSchema.safeParse({ passed: true, reason: "safe" }).success,
	"toxicity schema accepts {passed, reason}",
);

const prompt = renderPrompt("Q: {input}\nA: {output}", {
	input: "hi",
	output: "yo",
});
assert(prompt === "Q: hi\nA: yo", "renderPrompt substitutes fields");

const relParsed = parseJudgeObject(relevance, {
	score: 0.857,
	reason: "great",
});
assert(
	relParsed.score === 0.86 && relParsed.passed === null,
	"parse rounds score to 2 decimals, leaves passed null",
);
const toxParsed = parseJudgeObject(toxicity, { passed: false, reason: "bad" });
assert(
	toxParsed.passed === false && toxParsed.score === null,
	"parse maps passed, leaves score null",
);

console.log("\nALL EVALS ENGINE CHECKS PASSED ✅");
