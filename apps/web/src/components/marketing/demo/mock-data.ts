// Static, locally-typed data for the interactive landing-page demo. None of this
// touches tRPC or the live types — the demo is a faithful *visual* replica, so
// the shapes here only need to match what the demo components read. Where a real
// presentational component (e.g. TraceReplay) wants the deep tRPC `TraceSpan`,
// the demo casts `MockTraceSpan[] as unknown as TraceSpan[]` at the call site.

export type DemoTab =
  | "overview"
  | "workflows"
  | "agents"
  | "sessions"
  | "traces"
  | "evals"
  | "alerts";

// ─────────────────────────────────────────────────────────────────────────────
// Overview — KPI cards, time series, model/agent tables, live feed
// ─────────────────────────────────────────────────────────────────────────────

export type KpiCard = {
  label: string;
  value: string;
  delta: { pct: number; dir: "up" | "down" | "flat" } | null;
  deltaInverted?: boolean;
  hint: string;
};

export const KPIS: KpiCard[] = [
  {
    label: "Total cost",
    value: "$842.17",
    delta: { pct: 0.124, dir: "up" },
    deltaInverted: true,
    hint: "~$25.3k/mo · 98% priced",
  },
  {
    label: "Error rate",
    value: "0.8%",
    delta: { pct: 0.31, dir: "down" },
    deltaInverted: true,
    hint: "142 of 18.2k spans",
  },
  {
    label: "Eval pass rate",
    value: "94%",
    delta: { pct: 0.04, dir: "up" },
    hint: "6.1k checks · scored traffic",
  },
  {
    label: "Latency p95",
    value: "3.42s",
    delta: { pct: 0.09, dir: "down" },
    deltaInverted: true,
    hint: "p50 1.18s · TTFT p95 612ms",
  },
  {
    label: "Requests",
    value: "18.2k",
    delta: { pct: 0.22, dir: "up" },
    hint: "12.4k LLM spans",
  },
  {
    label: "Tokens",
    value: "42.8M",
    delta: { pct: 0.18, dir: "up" },
    hint: "31.2M in · 11.6M out",
  },
];

export type CostPoint = {
  label: string;
  "gpt-4o": number;
  "claude-sonnet": number;
  "gpt-4o-mini": number;
};

// 24 hourly buckets, stacked by model. Hand-shaped to look like a real workday
// ramp (quiet overnight, busy midday) rather than random noise.
export const COST_SERIES: CostPoint[] = [
  ["00:00", 4.2, 3.1, 0.8],
  ["02:00", 3.1, 2.4, 0.6],
  ["04:00", 2.8, 2.0, 0.5],
  ["06:00", 5.6, 4.2, 1.1],
  ["08:00", 12.4, 9.8, 2.4],
  ["10:00", 21.6, 16.2, 4.1],
  ["12:00", 28.3, 22.1, 5.6],
  ["14:00", 31.2, 24.8, 6.2],
  ["16:00", 26.7, 20.4, 5.1],
  ["18:00", 18.9, 14.3, 3.6],
  ["20:00", 11.2, 8.7, 2.2],
  ["22:00", 6.8, 5.1, 1.3],
].map(([label, a, b, c]) => ({
  label: label as string,
  "gpt-4o": a as number,
  "claude-sonnet": b as number,
  "gpt-4o-mini": c as number,
}));

export type LatencyPoint = {
  label: string;
  p50: number;
  p95: number;
  p99: number;
};

export const LATENCY_SERIES: LatencyPoint[] = [
  ["00:00", 980, 2400, 3600],
  ["02:00", 920, 2200, 3400],
  ["04:00", 940, 2300, 3500],
  ["06:00", 1050, 2800, 4100],
  ["08:00", 1180, 3200, 4800],
  ["10:00", 1240, 3420, 5100],
  ["12:00", 1310, 3680, 5400],
  ["14:00", 1180, 3420, 5000],
  ["16:00", 1120, 3100, 4600],
  ["18:00", 1040, 2900, 4200],
  ["20:00", 990, 2600, 3800],
  ["22:00", 960, 2450, 3650],
].map(([label, p50, p95, p99]) => ({
  label: label as string,
  p50: p50 as number,
  p95: p95 as number,
  p99: p99 as number,
}));

export type ModelRow = {
  modelId: string;
  requests: string;
  tokens: string;
  p95: string;
  cost: string;
};

export const MODEL_ROWS: ModelRow[] = [
  { modelId: "openai/gpt-4o", requests: "8.1k", tokens: "24.2M", p95: "3.61s", cost: "$512.40" },
  { modelId: "anthropic/claude-sonnet-4.6", requests: "5.6k", tokens: "14.1M", p95: "2.98s", cost: "$284.10" },
  { modelId: "openai/gpt-4o-mini", requests: "4.5k", tokens: "4.5M", p95: "1.42s", cost: "$45.67" },
];

export type AgentRow = {
  agentName: string;
  requests: string;
  errors: string;
  p95: string;
  cost: string;
};

export const AGENT_ROWS: AgentRow[] = [
  { agentName: "support-triage", requests: "6.2k", errors: "31", p95: "2.81s", cost: "$214.80" },
  { agentName: "research-planner", requests: "3.1k", errors: "12", p95: "4.12s", cost: "$318.20" },
  { agentName: "code-reviewer", requests: "2.4k", errors: "8", p95: "3.94s", cost: "$196.40" },
  { agentName: "email-drafter", requests: "1.8k", errors: "4", p95: "1.62s", cost: "$58.10" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Traces — list rows + one fleshed-out span waterfall
// ─────────────────────────────────────────────────────────────────────────────

export type TraceRow = {
  traceId: string;
  name: string;
  spans: string;
  tokens: string;
  duration: string;
  cost: string;
  when: string;
  errors?: number;
};

export const TRACE_ROWS: TraceRow[] = [
  { traceId: "tr_9f2a4c8e1b7d3a6f5e0c", name: "support-triage", spans: "8", tokens: "4.2k", duration: "5.84s", cost: "$0.0418", when: "12s ago" },
  { traceId: "tr_3b8e1d6a9c2f7b4e0a5d", name: "research-planner", spans: "14", tokens: "11.8k", duration: "9.12s", cost: "$0.1240", when: "48s ago" },
  { traceId: "tr_7c1f5a2b8e4d9c6a3f0b", name: "code-reviewer", spans: "6", tokens: "8.1k", duration: "4.36s", cost: "$0.0820", when: "2m ago", errors: 1 },
  { traceId: "tr_2d9a6c3f1b8e5d4a7c0f", name: "email-drafter", spans: "3", tokens: "1.9k", duration: "1.58s", cost: "$0.0094", when: "3m ago" },
  { traceId: "tr_5e0b8d4a2c7f1b9e6a3d", name: "support-triage", spans: "9", tokens: "4.8k", duration: "6.21s", cost: "$0.0472", when: "5m ago" },
  { traceId: "tr_8a3f1c6b9d2e7a4c0b5f", name: "research-planner", spans: "12", tokens: "10.2k", duration: "8.74s", cost: "$0.1080", when: "6m ago" },
];

export type MockTraceSpan = {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: "agent" | "llm" | "tool";
  status: "ok" | "error";
  startTime: string;
  endTime: string;
  durationMs: number;
  ttftMs: number | null;
  // Output tokens drive the throughput ribbon; total tokens + cost feed the
  // per-span rows and the whole-trace rollup the timeline renders.
  outputTokens: number;
  totalTokens: number;
  totalCost: number | null;
  chunkOffsets: number[];
  chunkTokens: number[];
};

// Base timestamps as ClickHouse datetime strings ('YYYY-MM-DD HH:MM:SS', UTC).
// One support-triage run: root agent → classify (llm) → fetch order (tool) →
// search KB (tool, llm child) → draft reply (llm).
const T = (sec: number, ms = 0) => {
  const base = new Date("2026-06-07T14:30:00Z").getTime();
  const d = new Date(base + sec * 1000 + ms);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

export const TRACE_SPANS: MockTraceSpan[] = [
  {
    spanId: "s0",
    parentSpanId: null,
    name: "support-triage",
    spanType: "agent",
    status: "ok",
    startTime: T(0),
    endTime: T(5, 840),
    durationMs: 5840,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s1",
    parentSpanId: "s0",
    name: "classify-intent",
    spanType: "llm",
    status: "ok",
    startTime: T(0, 120),
    endTime: T(1, 40),
    durationMs: 920,
    ttftMs: 280,
    outputTokens: 142,
    totalTokens: 612,
    totalCost: 0.0011,
    chunkOffsets: [280, 460, 640, 820, 920],
    chunkTokens: [4, 28, 71, 118, 142],
  },
  {
    spanId: "s2",
    parentSpanId: "s0",
    name: "fetch-order",
    spanType: "tool",
    status: "ok",
    startTime: T(1, 100),
    endTime: T(1, 720),
    durationMs: 620,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s3",
    parentSpanId: "s0",
    name: "search-knowledge-base",
    spanType: "tool",
    status: "ok",
    startTime: T(1, 780),
    endTime: T(3, 240),
    durationMs: 1460,
    ttftMs: null,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: null,
    chunkOffsets: [],
    chunkTokens: [],
  },
  {
    spanId: "s4",
    parentSpanId: "s3",
    name: "rerank-results",
    spanType: "llm",
    status: "ok",
    startTime: T(2, 100),
    endTime: T(3, 180),
    durationMs: 1080,
    ttftMs: 340,
    outputTokens: 264,
    totalTokens: 1486,
    totalCost: 0.0042,
    chunkOffsets: [340, 600, 860, 1080],
    chunkTokens: [6, 88, 196, 264],
  },
  {
    spanId: "s5",
    parentSpanId: "s0",
    name: "draft-reply",
    spanType: "llm",
    status: "ok",
    startTime: T(3, 320),
    endTime: T(5, 780),
    durationMs: 2460,
    ttftMs: 520,
    outputTokens: 689,
    totalTokens: 2961,
    totalCost: 0.0089,
    chunkOffsets: [520, 980, 1480, 1980, 2460],
    chunkTokens: [8, 142, 318, 512, 689],
  },
];

// The user/assistant payload shown when a trace span is selected.
export const TRACE_MESSAGES: { role: "system" | "user" | "assistant"; content: string }[] = [
  {
    role: "system",
    content: "You are a support triage agent. Classify the request, look up the order, and draft a concise reply.",
  },
  {
    role: "user",
    content: "Hey — my order #48213 still says \"processing\" after 5 days. Can you check what's going on?",
  },
  {
    role: "assistant",
    content:
      "I looked into order #48213 — it was held by an address-verification flag and cleared this morning. It's now packed and ships today, with delivery expected Tuesday. I've added expedited shipping at no charge for the delay.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────────────────────────────────

export type AgentCard = {
  name: string;
  requests: string;
  errorRate: string;
  p95: string;
  cost: string;
  passRate: string;
  models: string[];
};

export const AGENTS: AgentCard[] = [
  { name: "support-triage", requests: "6.2k", errorRate: "0.5%", p95: "2.81s", cost: "$214.80", passRate: "96%", models: ["gpt-4o", "gpt-4o-mini"] },
  { name: "research-planner", requests: "3.1k", errorRate: "0.4%", p95: "4.12s", cost: "$318.20", passRate: "91%", models: ["claude-sonnet-4.6"] },
  { name: "code-reviewer", requests: "2.4k", errorRate: "0.3%", p95: "3.94s", cost: "$196.40", passRate: "93%", models: ["gpt-4o", "claude-sonnet-4.6"] },
  { name: "email-drafter", requests: "1.8k", errorRate: "0.2%", p95: "1.62s", cost: "$58.10", passRate: "98%", models: ["gpt-4o-mini"] },
];

// Per-agent step flow (drives NodeFlow on the agent detail view).
export const AGENT_FLOW: {
  id: string;
  label: string;
  sublabel: string | null;
  status: "ok" | "error";
  timestamp: string;
  durationMs: number;
  type: "llm" | "tool" | "agent";
}[] = [
  { id: "f0", label: "classify-intent", sublabel: "gpt-4o-mini", status: "ok", timestamp: T(0, 120), durationMs: 920, type: "llm" },
  { id: "f1", label: "fetch-order", sublabel: "tool", status: "ok", timestamp: T(1, 100), durationMs: 620, type: "tool" },
  { id: "f2", label: "search-kb", sublabel: "tool", status: "ok", timestamp: T(1, 780), durationMs: 1460, type: "tool" },
  { id: "f3", label: "draft-reply", sublabel: "gpt-4o", status: "ok", timestamp: T(3, 320), durationMs: 2460, type: "llm" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Workflows
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowRow = {
  name: string;
  runs: string;
  steps: string;
  errorRate: string;
  p95: string;
  cost: string;
};

export const WORKFLOWS: WorkflowRow[] = [
  { name: "onboard-customer", runs: "1.2k", steps: "5", errorRate: "0.6%", p95: "12.4s", cost: "$142.30" },
  { name: "weekly-digest", runs: "842", steps: "4", errorRate: "0.2%", p95: "8.91s", cost: "$88.40" },
  { name: "incident-summary", runs: "318", steps: "6", errorRate: "1.2%", p95: "18.2s", cost: "$96.10" },
];

export const WORKFLOW_FLOW: {
  id: string;
  label: string;
  sublabel: string | null;
  status: "ok" | "error";
  timestamp: string;
  durationMs: number;
}[] = [
  { id: "w0", label: "fetch-profile", sublabel: "tool", status: "ok", timestamp: T(0), durationMs: 410 },
  { id: "w1", label: "research-planner", sublabel: "agent", status: "ok", timestamp: T(0, 500), durationMs: 3200 },
  { id: "w2", label: "enrich-context", sublabel: "tool", status: "ok", timestamp: T(3, 800), durationMs: 880 },
  { id: "w3", label: "email-drafter", sublabel: "agent", status: "ok", timestamp: T(4, 800), durationMs: 1900 },
  { id: "w4", label: "send", sublabel: "tool", status: "ok", timestamp: T(6, 800), durationMs: 240 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export type SessionRow = {
  sessionId: string;
  user: string;
  turns: string;
  tokens: string;
  cost: string;
  when: string;
};

export const SESSIONS: SessionRow[] = [
  { sessionId: "ses_a91f", user: "user_4821", turns: "12", tokens: "18.4k", cost: "$0.182", when: "1m ago" },
  { sessionId: "ses_3c7d", user: "user_1903", turns: "7", tokens: "9.2k", cost: "$0.094", when: "4m ago" },
  { sessionId: "ses_e02b", user: "user_7754", turns: "21", tokens: "31.6k", cost: "$0.318", when: "9m ago" },
  { sessionId: "ses_5d8a", user: "user_2210", turns: "4", tokens: "4.1k", cost: "$0.041", when: "14m ago" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Evals
// ─────────────────────────────────────────────────────────────────────────────

export type EvalRow = {
  id: string;
  name: string;
  type: "code" | "llm-judge";
  scored: string;
  passRate: number;
  avgScore: number;
  when: string;
};

export const EVALS: EvalRow[] = [
  { id: "ev_tone", name: "tone-and-politeness", type: "llm-judge", scored: "2.1k", passRate: 0.96, avgScore: 0.94, when: "30s ago" },
  { id: "ev_json", name: "valid-json-output", type: "code", scored: "1.8k", passRate: 0.99, avgScore: 0.99, when: "1m ago" },
  { id: "ev_grounded", name: "answer-groundedness", type: "llm-judge", scored: "1.4k", passRate: 0.88, avgScore: 0.85, when: "3m ago" },
  { id: "ev_pii", name: "no-pii-leak", type: "code", scored: "2.1k", passRate: 1.0, avgScore: 1.0, when: "4m ago" },
];

// Score distribution for the eval detail (0–1 buckets).
export const EVAL_DISTRIBUTION: { bucket: string; count: number }[] = [
  { bucket: "0.0", count: 8 },
  { bucket: "0.2", count: 14 },
  { bucket: "0.4", count: 41 },
  { bucket: "0.6", count: 132 },
  { bucket: "0.8", count: 386 },
  { bucket: "1.0", count: 819 },
];

export const EVAL_SAMPLES: { traceId: string; score: number; verdict: "pass" | "fail"; note: string }[] = [
  { traceId: "tr_9f2a4c8e", score: 0.97, verdict: "pass", note: "Polite, acknowledges delay, offers remedy." },
  { traceId: "tr_3b8e1d6a", score: 0.91, verdict: "pass", note: "Clear and courteous; slightly terse closing." },
  { traceId: "tr_7c1f5a2b", score: 0.42, verdict: "fail", note: "Curt tone; no acknowledgement of the issue." },
  { traceId: "tr_2d9a6c3f", score: 0.95, verdict: "pass", note: "Warm, on-brand, well-structured." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────────────────────

export type AlertRow = {
  id: string;
  name: string;
  metric: string;
  condition: string;
  status: "firing" | "ok";
  lastValue: string;
  when: string;
};

export const ALERTS: AlertRow[] = [
  { id: "al_cost", name: "Daily spend ceiling", metric: "cost", condition: "> $1,000 / day", status: "ok", lastValue: "$842", when: "checked 28s ago" },
  { id: "al_err", name: "Error-rate spike", metric: "error rate", condition: "> 2% over 5m", status: "firing", lastValue: "3.1%", when: "firing 4m" },
  { id: "al_lat", name: "p95 latency", metric: "latency", condition: "> 5s over 10m", status: "ok", lastValue: "3.42s", when: "checked 28s ago" },
  { id: "al_eval", name: "Groundedness drop", metric: "eval pass rate", condition: "< 85% over 1h", status: "ok", lastValue: "88%", when: "checked 1m ago" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Foggy — scripted assistant exchange
// ─────────────────────────────────────────────────────────────────────────────

export type FoggyTurn = {
  question: string;
  /** Optional "looking up …" tool chip shown before the answer streams. */
  tool?: string;
  answer: string;
};

export const FOGGY_SCRIPT: FoggyTurn[] = [
  {
    question: "Why did cost jump 12% today?",
    tool: "querying cost.byModel",
    answer:
      "Most of today's increase is openai/gpt-4o — it's up $58 vs yesterday, driven by the research-planner agent running ~600 more steps. claude-sonnet and gpt-4o-mini are roughly flat. Want me to break it down by agent?",
  },
  {
    question: "Which agent has the worst eval scores?",
    tool: "querying evals.byAgent",
    answer:
      "research-planner has the lowest answer-groundedness at 0.85 avg (88% pass) — the other agents sit above 0.93. The failures cluster on multi-hop questions where the planner skips the search-kb step.",
  },
];
