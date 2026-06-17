"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconCircleChevronRightFilled } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { CopyPromptButton } from "./copy-prompt-button";

// ─── Volumetric fog texture ───────────────────────────────────────────────────
// A drifting bank of mist made with fractal-noise turbulence (deterministic via
// a fixed seed — SSR-safe). The noise drives alpha so it reads as a dark grey
// haze over the panel.

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
          values="0 0 0 0 0.20
                  0 0 0 0 0.21
                  0 0 0 0 0.27
                  0 0 0 0.6 0.04"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// ─── Film grain ───────────────────────────────────────────────────────────────
// A static, desaturated fractal-noise speckle blended over the fog so the panel
// reads textured rather than flat. Cheap (rendered once, no animation) and
// reduced-motion-safe.

function Noise() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 h-full w-full opacity-[0.16] mix-blend-overlay"
      preserveAspectRatio="none"
    >
      <filter id="cta-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves={3}
          stitchTiles="stitch"
          result="noise"
        />
        <feColorMatrix in="noise" type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#cta-grain)" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// The closing CTA: the copy sits in a panel quietly shrouded in drifting fog —
// "all there, all invisible". Reduced-motion users get the plain panel.

export function CtaSection() {
  const reduce = useReducedMotion() ?? false;

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div
        className="relative isolate flex flex-col justify-center overflow-hidden rounded-3xl corner-squircle bg-card dark:bg-card/60 shadow-(--custom-shadow) px-6 py-14 sm:px-16"
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

        {/* ── The fog blanket — drifting turbulence over a uniform haze floor.
              Masked to fade out toward the left so it thins behind the copy and
              concentrates on the right. ── */}
        {!reduce && (
          <div
            className="absolute inset-0 z-10"
            aria-hidden
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 5%, #000 52%)",
              maskImage:
                "linear-gradient(to right, transparent 5%, #000 52%)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "rgba(78,82,96,0.11)" }}
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

        {/* ── Film grain, above the fog. ── */}
        <Noise />

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
            <Button
              render={<Link href="/login" />}
              size="lg"
              className="text-base"
            >
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
