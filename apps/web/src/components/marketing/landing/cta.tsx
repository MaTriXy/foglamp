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
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Metric tile definitions ─────────────────────────────────────────────────
// Fixed data — no Math.random()/Date.now() at module/render time. Positions are
// percentages of the panel; `accent` is a real color so a revealed tile can
// light up in its own hue (border + glow + icon). The fog version stays muted.

type Tile = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  /** left% top% */
  pos: [number, number];
};

const BLUE = "#3b82f6";
const AMBER = "#eab308";
const FUCHSIA = "#d946ef";
const EMERALD = "#10b981";
const ROSE = "#f43f5e";

const TILES: Tile[] = [
  { label: "Tokens", value: "1.24M", icon: IconCirclesFilled, accent: BLUE, pos: [7, 20] },
  { label: "p50 latency", value: "240ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [49, 13] },
  { label: "p95 latency", value: "820ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [38, 34] },
  { label: "Error rate", value: "1.2%", icon: IconAlertTriangleFilled, accent: ROSE, pos: [74, 19] },
  { label: "Requests", value: "12.4k", icon: IconBolt, accent: BLUE, pos: [90, 46] },
  { label: "Eval rate", value: "94%", icon: IconGaugeFilled, accent: EMERALD, pos: [62, 64] },
  { label: "Total cost", value: "$4.21", icon: IconCoinFilled, accent: AMBER, pos: [25, 64] },
  { label: "Tokens/s", value: "1.8k", icon: IconCirclesFilled, accent: BLUE, pos: [12, 86] },
  { label: "Cost/call", value: "$0.003", icon: IconCoinFilled, accent: AMBER, pos: [50, 88] },
  { label: "Spans", value: "48.9k", icon: IconBolt, accent: EMERALD, pos: [82, 82] },
];

// ─── Single metric tile ───────────────────────────────────────────────────────
// `lit` switches between the fog version (muted) and the revealed version
// (accent border + colored glow + tinted icon), so being inside the beam reads
// as the tile "powering on".

function MetricTile({ tile, lit }: { tile: Tile; lit?: boolean }) {
  const Icon = tile.icon;
  return (
    <div
      className={cn(
        "absolute flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
        lit ? "bg-card" : "border-border/35 bg-card/55 backdrop-blur-sm"
      )}
      style={{
        left: `${tile.pos[0]}%`,
        top: `${tile.pos[1]}%`,
        transform: "translate(-50%, -50%)",
        minWidth: "7.75rem",
        ...(lit
          ? {
              borderColor: `${tile.accent}66`,
              boxShadow: `0 0 28px -6px ${tile.accent}88, 0 1px 2px rgba(0,0,0,0.4)`,
            }
          : {}),
      }}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg"
        style={{
          backgroundColor: lit
            ? `${tile.accent}24`
            : "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
        }}
      >
        <Icon
          className={cn("size-3.5", !lit && "text-muted-foreground/70")}
          style={lit ? { color: tile.accent } : undefined}
        />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground truncate">
          {tile.label}
        </p>
        <p
          className={cn(
            "mt-1 text-sm font-semibold leading-none tabular-nums",
            lit ? "text-foreground" : "text-muted-foreground/80"
          )}
        >
          {tile.value}
        </p>
      </div>
    </div>
  );
}

// ─── Volumetric fog texture ───────────────────────────────────────────────────
// A drifting bank of mist made with fractal-noise turbulence (deterministic via
// a fixed seed — SSR-safe). RGB is forced to a dark grey and the noise drives
// alpha, so it reads as a dark, moody haze over the panel.

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
        {/* RGB → dark grey; alpha → thresholded noise (wisps). */}
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.28
                  0 0 0 0 0.30
                  0 0 0 0 0.38
                  0 0 0 0.85 -0.16"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// ─── Auto-sweep rAF hook ──────────────────────────────────────────────────────
// Drifts the beam's aim point left↔right until the user takes over with their
// pointer, so the cone sweeps the panel like a searchlight on its own.

function useAutoSweep(
  panelRef: React.RefObject<HTMLDivElement | null>,
  reduce: boolean,
  userTookOver: boolean
): { mx: number; my: number } {
  const [pos, setPos] = useState({ mx: 0, my: 0 });
  const rafRef = useRef<number>(0);
  const startTsRef = useRef<number | null>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ mx: width / 2, my: height / 2 });

    if (reduce || userTookOver) return;

    const PERIOD_MS = 7000;
    const step = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const t = (ts - startTsRef.current) / PERIOD_MS;
      const { width: w, height: h } = el.getBoundingClientRect();
      const mx = w * (0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
      const my = h * (0.55 + 0.32 * Math.sin(t * Math.PI * 2 * 0.7 + 1.0));
      setPos({ mx, my });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      startTsRef.current = null;
    };
  }, [panelRef, reduce, userTookOver]);

  return pos;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CtaSection() {
  const reduce = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [userTookOver, setUserTookOver] = useState(false);

  const livePos = useRef<{ mx: number; my: number } | null>(null);
  const smoothRaf = useRef<number>(0);
  const autoPos = useAutoSweep(panelRef, reduce, userTookOver);

  // Each frame: smooth the aim point toward the live (or auto-sweep) target,
  // then turn it into the cone's bearing from the top-right apex and publish it
  // as `--ba` (degrees, conic convention: 0=up, 90=right, 180=down, 270=left).
  // Imperative so the rAF loop never re-renders React.
  useEffect(() => {
    if (reduce) return;
    const LERP = 0.13;
    let curMx: number | null = null;
    let curMy: number | null = null;
    const tick = () => {
      const target = livePos.current ?? { mx: autoPos.mx, my: autoPos.my };
      if (curMx === null) curMx = target.mx;
      if (curMy === null) curMy = target.my;
      curMx += (target.mx - curMx) * LERP;
      curMy += (target.my - curMy) * LERP;

      const panel = panelRef.current;
      const inner = innerRef.current;
      if (panel && inner) {
        const { width: w } = panel.getBoundingClientRect();
        // Apex at the top-right corner (w, 0); bearing toward the aim point.
        const dx = curMx - w;
        const dy = curMy;
        let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        deg = ((deg % 360) + 360) % 360;
        inner.style.setProperty("--ba", String(deg));
      }
      smoothRaf.current = requestAnimationFrame(tick);
    };
    smoothRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(smoothRaf.current);
  }, [reduce, autoPos]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduce) return;
      if (!userTookOver) setUserTookOver(true);
      const rect = e.currentTarget.getBoundingClientRect();
      livePos.current = { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    },
    [reduce, userTookOver]
  );

  const handlePointerLeave = useCallback(() => {
    livePos.current = null;
    setUserTookOver(false);
  }, []);

  // The cone = an angular wedge (conic) clipped by a distance falloff (radial),
  // both anchored at the top-right apex, intersected. `--ba` rotates the wedge
  // to aim at the cursor; a fallback keeps it pointed down-left before mount.
  const conic =
    "conic-gradient(from calc((var(--ba, 215) - 90) * 1deg) at 100% 0%, transparent 74deg, #000 83deg, #000 97deg, transparent 106deg)";
  const radial =
    "radial-gradient(150% 150% at 100% 0%, #000 0%, #000 40%, transparent 84%)";
  const coneMask: React.CSSProperties = {
    WebkitMaskImage: `${conic}, ${radial}`,
    maskImage: `${conic}, ${radial}`,
    WebkitMaskComposite: "source-in",
    maskComposite: "intersect",
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div
        ref={panelRef}
        className="relative isolate overflow-hidden rounded-3xl corner-squircle bg-card dark:bg-card/60 shadow-(--custom-shadow) px-6 py-14 sm:px-12"
        style={{ minHeight: "480px", cursor: reduce ? undefined : "none" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
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

        {!reduce && (
          <>
            {/* Dark veil — deepens the panel so the fog reads moody, not bright. */}
            <div
              aria-hidden
              className="absolute inset-0 z-0"
              style={{ background: "rgba(4,5,8,0.34)" }}
            />
            {/* A ghost of data, lost in the murk. */}
            <div
              className="absolute inset-0 z-0 select-none"
              aria-hidden
              style={{ filter: "blur(7px)", opacity: 0.28 }}
            >
              {TILES.map((tile, i) => (
                <MetricTile key={i} tile={tile} />
              ))}
            </div>
            {/* Rolling fog — drifting turbulence banks, dark and full-coverage.
                The cone of light occludes it from above. */}
            <div className="absolute inset-0 z-0" aria-hidden>
              <motion.div
                className="absolute -inset-[15%] opacity-90"
                style={{ filter: "blur(7px)" }}
                animate={{ x: ["-3%", "4%", "-3%"], y: ["-2%", "2%", "-2%"] }}
                transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
              >
                <FogBank id="fog-a" freq={0.0085} seed={7} />
              </motion.div>
              <motion.div
                className="absolute -inset-[15%] opacity-70"
                style={{ filter: "blur(13px)" }}
                animate={{ x: ["3%", "-4%", "3%"], y: ["2%", "-3%", "2%"] }}
                transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
              >
                <FogBank id="fog-b" freq={0.014} seed={29} octaves={5} />
              </motion.div>
            </div>
          </>
        )}

        {/* ── Headline block — always fully legible, above the fog ── */}
        <div className="relative z-30 max-w-xl pointer-events-none">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your agents are running in the fog.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            Cost, latency, errors, eval scores — all there, all invisible. Wrap
            your model and turn the light on.
          </p>
          <div className="mt-7 pointer-events-auto">
            <Button render={<Link href="/login" />} size="lg" className="text-base">
              Start free
              <IconCircleChevronRightFilled className="size-5 ml-0.5 opacity-90" />
            </Button>
          </div>
        </div>

        {/* ── The cone of light. The inner div carries --ba (the beam bearing). ── */}
        <div ref={innerRef} className="absolute inset-0 z-10">
          {reduce ? (
            <div className="absolute inset-0 select-none" aria-hidden>
              {TILES.map((tile, i) => (
                <MetricTile key={i} tile={tile} lit />
              ))}
            </div>
          ) : (
            <div
              className="absolute inset-0 select-none"
              aria-hidden
              style={{ ...coneMask, background: "var(--card)" }}
            >
              {/* The beam itself — brightest at the apex, dissipating along it.
                  Two stops: a hot core near the source plus a longer warm wash,
                  so the cone clearly glows against the dark fog. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(150% 150% at 100% 0%, rgba(255,251,242,0.5) 0%, rgba(255,247,230,0.26) 22%, rgba(255,243,220,0.1) 44%, transparent 68%)",
                }}
              />
              {TILES.map((tile, i) => (
                <MetricTile key={i} tile={tile} lit />
              ))}
            </div>
          )}
        </div>

        {/* ── Headline scrim: keeps the copy legible even when the beam or a
              bright bank of fog drifts behind it. ── */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(125% 130% at -8% 34%, var(--card) 16%, transparent 54%)",
          }}
        />

        {/* ── Vignette: settles the far edges back into the card. ── */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
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
