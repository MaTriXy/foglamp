// Shared timeline math for the trace waterfall and the replay view. Span shape
// is inferred from the tRPC router output so it tracks the server contract
// (including chunkOffsets/chunkTokens/tps) without a manual re-declaration.

import type { RouterOutputs } from "@/utils/trpc";

export type TraceSpan = RouterOutputs["traces"]["get"]["spans"][number];

/** ClickHouse datetime string ('YYYY-MM-DD HH:MM:SS', UTC) → epoch ms. */
export function toMs(value: string): number {
  return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

/** Order spans depth-first by parent so the waterfall reads top-to-bottom. */
export function orderSpans(spans: TraceSpan[]): { span: TraceSpan; depth: number }[] {
  const children = new Map<string, TraceSpan[]>();
  const roots: TraceSpan[] = [];
  for (const s of spans) {
    if (s.parentSpanId && spans.some((p) => p.spanId === s.parentSpanId)) {
      const list = children.get(s.parentSpanId) ?? [];
      list.push(s);
      children.set(s.parentSpanId, list);
    } else {
      roots.push(s);
    }
  }
  const byStart = (a: TraceSpan, b: TraceSpan) => toMs(a.startTime) - toMs(b.startTime);
  const out: { span: TraceSpan; depth: number }[] = [];
  const walk = (s: TraceSpan, depth: number) => {
    out.push({ span: s, depth });
    (children.get(s.spanId) ?? []).sort(byStart).forEach((c) => walk(c, depth + 1));
  };
  roots.sort(byStart).forEach((r) => walk(r, 0));
  return out;
}

/** Trace-relative window: absolute start (ms) and total span (ms, min 1). */
export function computeWindow(spans: TraceSpan[]): { start: number; span: number } {
  if (spans.length === 0) return { start: 0, span: 1 };
  const start = Math.min(...spans.map((s) => toMs(s.startTime)));
  const end = Math.max(...spans.map((s) => toMs(s.endTime)));
  return { start, span: Math.max(end - start, 1) };
}

/** True when a span carries usable intra-stream samples (≥2 points to draw). */
export function hasChunkSamples(span: TraceSpan): boolean {
  return span.chunkOffsets.length > 1 && span.chunkOffsets.length === span.chunkTokens.length;
}

/**
 * Cumulative output tokens at `offsetMs` from step start, linearly interpolated
 * between samples. Returns 0 before the first sample and the final token count
 * after the last. Caller should guard with hasChunkSamples first.
 */
export function tokensAtOffset(span: TraceSpan, offsetMs: number): number {
  const offsets = span.chunkOffsets;
  const tokens = span.chunkTokens;
  if (offsets.length === 0) return 0;
  if (offsetMs <= offsets[0]!) return offsetMs <= 0 ? 0 : tokens[0]!;
  const lastIdx = offsets.length - 1;
  if (offsetMs >= offsets[lastIdx]!) return tokens[lastIdx]!;
  // Linear scan is fine: arrays are capped at 200 entries.
  for (let i = 1; i < offsets.length; i++) {
    const x1 = offsets[i]!;
    if (offsetMs <= x1) {
      const x0 = offsets[i - 1]!;
      const y0 = tokens[i - 1]!;
      const y1 = tokens[i]!;
      const t = x1 === x0 ? 0 : (offsetMs - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return tokens[lastIdx]!;
}

export type TpsPoint = { ms: number; tps: number };

/**
 * A span's generation throughput as piecewise-constant segments in
 * window-relative ms. For a streaming span this is the per-chunk instantaneous
 * rate (Δtokens / Δseconds); for a non-streaming span (or one whose chunk array
 * is empty) it's a single flat-average segment spanning the post-TTFT window.
 * Non-llm spans and zero-output spans contribute nothing — their stretch of the
 * trace reads as dead air. Used to build the aggregate throughput ribbon.
 */
function spanSegments(
  span: TraceSpan,
  windowStart: number,
): { start: number; end: number; tps: number }[] {
  if (span.spanType !== "llm" || span.outputTokens <= 0) return [];
  const base = toMs(span.startTime) - windowStart;
  if (hasChunkSamples(span)) {
    const offsets = span.chunkOffsets;
    const tokens = span.chunkTokens;
    const segs: { start: number; end: number; tps: number }[] = [];
    for (let i = 1; i < offsets.length; i++) {
      const dt = (offsets[i]! - offsets[i - 1]!) / 1000;
      if (dt <= 0) continue;
      segs.push({
        start: base + offsets[i - 1]!,
        end: base + offsets[i]!,
        tps: (tokens[i]! - tokens[i - 1]!) / dt,
      });
    }
    return segs;
  }
  // Flat-average fallback across the generation window (after first token).
  const ttft = span.ttftMs ?? 0;
  const genMs = span.durationMs - ttft;
  if (genMs <= 0) return [];
  return [
    {
      start: base + ttft,
      end: base + span.durationMs,
      tps: span.outputTokens / (genMs / 1000),
    },
  ];
}

/**
 * Aggregate generation throughput (tokens/sec) across the whole trace window,
 * sampled onto a fixed grid of `sampleCount + 1` points. Concurrent spans sum;
 * TTFT waits and tool gaps read as zero. The result is the trace's throughput
 * "fingerprint" — a single curve over the shared time axis. O(samples ×
 * segments), which is fine for typical traces (segments capped at 200/span).
 */
export function throughputSeries(
  spans: TraceSpan[],
  window: { start: number; span: number },
  sampleCount = 240,
): TpsPoint[] {
  const segments = spans.flatMap((s) => spanSegments(s, window.start));
  const out: TpsPoint[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const ms = (i / sampleCount) * window.span;
    let tps = 0;
    for (const seg of segments) {
      // Half-open intervals so abutting segments don't double-count the seam.
      if (ms >= seg.start && ms < seg.end) tps += seg.tps;
    }
    out.push({ ms, tps });
  }
  return out;
}

/** Largest tps across a series (≥1, so an all-zero series still scales sanely). */
export function peakTps(series: TpsPoint[]): number {
  let max = 1;
  for (const p of series) if (p.tps > max) max = p.tps;
  return max;
}
