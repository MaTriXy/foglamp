import type { Preset } from "./presets";
import type { ExtractedContext, ScoringTarget } from "./types";

// Context-extraction engine: resolves the fields a preset needs from a target
// (+ its sibling spans). The tricky case is RAG presets (faithfulness,
// context-relevance) whose "context" lives in OTHER spans of the same trace —
// typically the retrieval (embedding) or tool steps that ran before the target.

export type ContextSpec = {
  // Which sibling span types supply retrieved context (default embedding+tool).
  spanTypes?: string[];
  // Metadata key holding the reference answer (default "reference").
  referenceKey?: string;
};

const DEFAULT_CONTEXT_SPAN_TYPES = ["embedding", "tool"];
const DEFAULT_REFERENCE_KEY = "reference";

function json(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Flatten one AI-SDK content part to readable text. Text/reasoning parts give
// their text; tool calls/results are tagged compactly so the judge sees what
// ran without a wall of JSON; anything else falls back to its JSON.
function partText(p: unknown): string {
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    if ((o.type === "text" || o.type === "reasoning") && typeof o.text === "string") {
      return o.text;
    }
    if (o.type === "tool-call") {
      return `[tool-call ${String(o.toolName ?? o.name ?? "tool")}] ${json(o.input ?? o.args ?? {})}`;
    }
    if (o.type === "tool-result") {
      return `[tool-result ${String(o.toolName ?? o.name ?? "tool")}] ${json(o.output ?? o.result ?? {})}`;
    }
    if ("content" in o) return contentText(o.content);
  }
  return json(p);
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(partText).filter(Boolean).join("\n");
  if (content == null) return "";
  return partText(content);
}

// Span payloads are JSON-encoded by the SDK. For judge readability, unwrap a
// JSON string to its text, flatten AI-SDK message/part arrays to their text
// (a bare string answer or `[{role, content}]` turns, role-prefixed), and pass
// non-JSON payloads through untouched.
function humanize(payload: string): string {
  if (!payload) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return payload; // not JSON — use as-is
  }
  if (typeof parsed === "string") return parsed;
  if (Array.isArray(parsed)) {
    const text = parsed
      .map((m) => {
        if (m && typeof m === "object" && "role" in (m as object)) {
          const o = m as Record<string, unknown>;
          const body = contentText(o.content);
          const role = typeof o.role === "string" ? o.role : null;
          return role && body ? `${role}: ${body}` : body;
        }
        return partText(m);
      })
      .filter(Boolean)
      .join("\n\n");
    return text || payload;
  }
  if (parsed && typeof parsed === "object") {
    return partText(parsed) || payload;
  }
  return String(parsed);
}

// Render the SDK's JSON tool catalog (`{name: {description, parameters}}`) as a
// compact, judge-readable list. Falls back to the raw string if it isn't the
// expected shape (e.g. truncated), so the judge still sees something.
function formatToolCatalog(json: string): string {
  if (!json) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json;
  const lines = Object.entries(parsed as Record<string, unknown>).map(([name, def]) => {
    const d = def && typeof def === "object" ? (def as Record<string, unknown>) : {};
    const desc = typeof d.description === "string" ? d.description : "";
    return desc ? `- ${name}: ${desc}` : `- ${name}`;
  });
  return lines.join("\n");
}

export function buildContext(
  target: ScoringTarget,
  preset: Preset,
  spec: ContextSpec = {},
): ExtractedContext {
  const extracted: ExtractedContext = {
    input: humanize(target.input),
    output: humanize(target.output),
  };

  if (preset.needsContext) {
    const types = new Set(spec.spanTypes ?? DEFAULT_CONTEXT_SPAN_TYPES);
    const chunks = target.siblings
      .filter(
        (s) =>
          s.spanId !== target.targetId &&
          types.has(s.spanType) &&
          // Span-level targets: only context that ran before this span. Trace-
          // level targets ARE the root agent span (it starts first), so a
          // start-time bound would drop every child — take all matching
          // siblings instead.
          (target.level === "trace" || s.startTimeMs <= target.startTimeMs),
      )
      .sort((a, b) => a.startTimeMs - b.startTimeMs)
      .map((s) => humanize(s.output))
      .filter(Boolean);
    extracted.context = chunks.join("\n\n---\n\n");
  }

  if (preset.needsReference) {
    const key = spec.referenceKey ?? DEFAULT_REFERENCE_KEY;
    extracted.reference = target.metadata[key] ?? "";
  }

  if (preset.needsTools) {
    // The candidate is a tool span; the catalog lives on the trace's llm/agent
    // spans (the model's view). Take the first sibling that carries one.
    const raw = target.siblings.find((s) => s.toolCatalog)?.toolCatalog ?? "";
    extracted.tools = formatToolCatalog(raw);
  }

  return extracted;
}
