"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconBolt,
  IconCircleChevronRightFilled,
  IconCirclesFilled,
  IconCoinFilled,
  IconGaugeFilled,
} from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CopyPromptButton } from "./copy-prompt-button";

// ─── Metric tile definitions ─────────────────────────────────────────────────
// Fixed data — no Math.random()/Date.now() at module/render time. Positions are
// percentages of the panel; `accent` is each tile's hue (border + glow + icon).

type Tile = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  /** left% top% (the tile is centered on this point) */
  pos: [number, number];
};

const BLUE = "#3b82f6";
const AMBER = "#eab308";
const FUCHSIA = "#d946ef";
const EMERALD = "#10b981";
const ROSE = "#f43f5e";

// Ordered so consecutive tiles sit far apart — the surfacing window rolls
// through this list, so neighbours shouldn't cluster in one spot.
// Positions stay clear of the top-left, where the headline + buttons live: a
// tile centre is either on the right half (x ≥ 54) or low enough to clear the
// buttons (y ≥ 58).
const TILES: Tile[] = [
  { label: "Eval rate", value: "94%", icon: IconGaugeFilled, accent: EMERALD, pos: [70, 26] },
  { label: "Total cost", value: "$4.21", icon: IconCoinFilled, accent: AMBER, pos: [26, 72] },
  { label: "Error rate", value: "1.2%", icon: IconAlertTriangleFilled, accent: ROSE, pos: [86, 60] },
  { label: "Tokens", value: "1.24M", icon: IconCirclesFilled, accent: BLUE, pos: [62, 18] },
  { label: "p95 latency", value: "820ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [88, 34] },
  { label: "Cost/call", value: "$0.003", icon: IconCoinFilled, accent: AMBER, pos: [48, 84] },
  { label: "Requests", value: "12.4k", icon: IconBolt, accent: BLUE, pos: [74, 48] },
  { label: "p50 latency", value: "240ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [36, 82] },
  { label: "Tokens/s", value: "1.8k", icon: IconCirclesFilled, accent: BLUE, pos: [88, 80] },
  { label: "Spans", value: "48.9k", icon: IconBolt, accent: EMERALD, pos: [62, 66] },
];

const tileBoxStyle = (tile: Tile): React.CSSProperties => ({
  left: `${tile.pos[0]}%`,
  top: `${tile.pos[1]}%`,
  minWidth: "7.75rem",
  borderColor: `${tile.accent}66`,
  boxShadow: `0 0 28px -6px ${tile.accent}88, 0 1px 2px rgba(0,0,0,0.4)`,
});

const TILE_BOX =
  "absolute flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5";

function TileBody({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `${tile.accent}24` }}
      >
        <Icon className="size-3.5" style={{ color: tile.accent }} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground truncate">
          {tile.label}
        </p>
        <p className="mt-1 text-sm font-semibold leading-none tabular-nums text-foreground">
          {tile.value}
        </p>
      </div>
    </>
  );
}

// ─── Volumetric fog texture ───────────────────────────────────────────────────
// A drifting bank of mist made with fractal-noise turbulence (deterministic via
// a fixed seed — SSR-safe). The noise drives alpha so it reads as a grey haze.

function FogBank({
  id,
  freq,
  seed,
  octaves = 4,
}: {
  id: string;
  freq: number;
  seed: number;
  octaves?: number;
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="none"
    >
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency={freq}
          numOctaves={octaves}
          seed={seed}
          stitchTiles="stitch"
          result="noise"
        />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.42
                  0 0 0 0 0.45
                  0 0 0 0 0.54
                  0 0 0 0.6 0.04"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// ─── Surfacing scheduler ──────────────────────────────────────────────────────
// The fog never lifts. Instead a rolling window of a few stats surfaces above
// it — fading + scaling + sharpening in — holds for a few seconds, then sinks
// back as the next one rises. One in, one out each tick keeps it calm.
const VISIBLE = 3;
const CYCLE_MS = 1600;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ─── Main component ───────────────────────────────────────────────────────────

export function CtaSection() {
  const reduce = useReducedMotion() ?? false;
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(
      () => setStart((s) => (s + 1) % TILES.length),
      CYCLE_MS
    );
    return () => clearInterval(id);
  }, [reduce]);

  const active = Array.from(
    { length: VISIBLE },
    (_, k) => (start + k) % TILES.length
  );

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div
        className="relative isolate overflow-hidden rounded-3xl corner-squircle bg-card dark:bg-card/60 shadow-(--custom-shadow) px-6 py-14 sm:px-12"
        style={{ minHeight: "480px" }}
      >
        {/* ── Faint dashboard grid so the panel reads as a surface under the fog. ── */}
        <div
          aria-hidden
          className="absolute inset-0 z-0 opacity-40 dark:opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            WebkitMaskImage:
              "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
            maskImage:
              "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
          }}
        />

        {/* ── Surfacing stats — above the fog, a rolling few at a time. ── */}
        <div className="absolute inset-0 z-20" aria-hidden>
          {reduce ? (
            TILES.map((tile, i) => (
              <div
                key={i}
                className={TILE_BOX}
                style={{
                  ...tileBoxStyle(tile),
                  transform: "translate(-50%, -50%)",
                }}
              >
                <TileBody tile={tile} />
              </div>
            ))
          ) : (
            <AnimatePresence>
              {active.map((i) => (
                <motion.div
                  key={i}
                  className={TILE_BOX}
                  style={{ ...tileBoxStyle(TILES[i]!), x: "-50%", y: "-50%" }}
                  initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.92, filter: "blur(8px)" }}
                  transition={{ duration: 0.6, ease: EASE }}
                >
                  <TileBody tile={TILES[i]!} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* ── The fog blanket — drifting turbulence over a uniform haze floor.
              Constant and full-coverage; the stats surface *above* it. ── */}
        {!reduce && (
          <div className="absolute inset-0 z-10" aria-hidden>
            <div
              className="absolute inset-0"
              style={{ background: "rgba(150,156,172,0.14)" }}
            />
            <motion.div
              className="absolute -inset-[15%] opacity-80"
              style={{ filter: "blur(8px)" }}
              animate={{ x: ["-3%", "4%", "-3%"], y: ["-2%", "2%", "-2%"] }}
              transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
            >
              <FogBank id="fog-a" freq={0.011} seed={7} />
            </motion.div>
            <motion.div
              className="absolute -inset-[15%] opacity-60"
              style={{ filter: "blur(16px)" }}
              animate={{ x: ["3%", "-4%", "3%"], y: ["2%", "-3%", "2%"] }}
              transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
            >
              <FogBank id="fog-b" freq={0.02} seed={29} octaves={5} />
            </motion.div>
          </div>
        )}

        {/* ── Headline block — above the fog, always fully legible. ── */}
        <div className="relative z-30 max-w-xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your agents are running in the fog.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            Cost, latency, errors, eval scores — all there, all invisible. Wrap
            your model and turn the light on.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button render={<Link href="/login" />} size="lg" className="text-base">
              Start free
              <IconCircleChevronRightFilled className="size-5 ml-0.5 opacity-90" />
            </Button>
            <CopyPromptButton />
          </div>
        </div>

        {/* ── Headline scrim: keeps the copy legible over the fog. ── */}
        <div
          className="absolute inset-0 z-[25] pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(125% 130% at -8% 34%, var(--card) 16%, transparent 54%)",
          }}
        />

        {/* ── Vignette: settles the far edges back into the card. ── */}
        <div
          className="absolute inset-0 z-[25] pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 92% 82% at 50% 50%, transparent 52%, var(--card) 100%)",
          }}
        />
      </div>
    </section>
  );
}
