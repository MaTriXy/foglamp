"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { IconArrowRight } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { products, type Product } from "../products";

// Mini, dependency-free widgets — one per feature. Hand-built SVG/CSS so the
// landing page stays SSR-safe and light (no Recharts here; the real charts live
// in the lazy demo). Colors are hardcoded per slug because Tailwind v4 can't
// JIT classes built from a runtime `accent` string.

function CostWidget() {
  // A stacked-ish area sparkline ramping like a workday.
  return (
    <svg viewBox="0 0 200 64" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="bento-cost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-amber-500)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--color-amber-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 56 L18 52 L36 50 L54 40 L72 30 L90 18 L108 10 L126 16 L144 26 L162 34 L180 44 L200 50 L200 64 L0 64 Z"
        fill="url(#bento-cost)"
      />
      <path
        d="M0 56 L18 52 L36 50 L54 40 L72 30 L90 18 L108 10 L126 16 L144 26 L162 34 L180 44 L200 50"
        fill="none"
        stroke="var(--color-amber-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EvalsWidget() {
  const segs = [
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-emerald-500/80",
    "bg-rose-500/70",
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">94%</span>
        <span className="text-xs text-muted-foreground">pass rate</span>
      </div>
      <div className="flex gap-1">
        {segs.map((c, i) => (
          <span key={i} className={cn("h-2 flex-1 rounded-full", c)} />
        ))}
      </div>
    </div>
  );
}

function AlertsWidget() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center gap-2 rounded-2xl corner-squircle bg-rose-500/10 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]">
        <span className="relative grid size-2.5 place-items-center">
          <span className="absolute size-2.5 animate-ping rounded-full bg-rose-500/50" />
          <span className="relative size-1.5 rounded-full bg-rose-500" />
        </span>
        <span className="text-sm font-medium">Error-rate spike</span>
        <span className="ml-auto font-mono text-xs text-rose-500">3.1%</span>
      </div>
      <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Daily spend ceiling · OK
      </div>
    </div>
  );
}

function AgentsWidget() {
  const dots = ["bg-violet-500", "bg-blue-500", "bg-amber-500"];
  return (
    <div className="flex h-full items-center justify-center gap-1">
      {dots.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className={cn("grid size-8 place-items-center rounded-2xl corner-squircle text-white", c)}>
            <span className="size-3 rounded-full bg-white/80" />
          </span>
          {i < dots.length - 1 && <span className="h-px w-5 bg-foreground/20" />}
        </div>
      ))}
    </div>
  );
}

function TracesWidget() {
  const bars = [
    { left: 0, width: 100, c: "bg-amber-500/70" },
    { left: 4, width: 22, c: "bg-violet-500/70" },
    { left: 26, width: 14, c: "bg-blue-500/70" },
    { left: 40, width: 34, c: "bg-blue-500/70" },
    { left: 46, width: 22, c: "bg-violet-500/70" },
    { left: 74, width: 24, c: "bg-violet-500/70" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      {bars.map((b, i) => (
        <div key={i} className="relative h-2">
          <span
            className={cn("absolute top-0 h-2 rounded-full", b.c)}
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function SdkWidget() {
  return (
    <div className="flex h-full flex-col justify-center gap-1 font-mono text-xs leading-relaxed">
      <span>
        <span className="text-violet-600 dark:text-violet-400">import</span>{" "}
        <span className="text-muted-foreground">{"{ foglamp }"}</span>
      </span>
      <span>
        <span className="text-violet-600 dark:text-violet-400">const</span> model ={" "}
        <span className="text-emerald-600 dark:text-emerald-400">foglamp</span>(model)
      </span>
    </div>
  );
}

const WIDGETS: Record<string, () => React.ReactNode> = {
  "cost-intelligence": CostWidget,
  evals: EvalsWidget,
  alerts: AlertsWidget,
  agents: AgentsWidget,
  "distributed-traces": TracesWidget,
  sdk: SdkWidget,
};

function BentoCard({ product, index }: { product: Product; index: number }) {
  const reduce = useReducedMotion();
  const Icon = product.icon;
  const Widget = WIDGETS[product.slug];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.32, 0.72, 0, 1] }}
    >
      <Link
        href={product.href}
        className="group flex h-full flex-col gap-4 rounded-3xl corner-squircle bg-card p-6 shadow-(--custom-shadow) transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_0_0_var(--border),0_18px_40px_-20px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-center gap-3">
          <span className={product.chipClassName}>
            <Icon className="size-4" />
          </span>
          <h3 className="font-display text-lg font-medium">{product.label}</h3>
        </div>
        <p className="text-sm text-muted-foreground text-pretty">{product.tagline}</p>
        <div className="h-20 flex-1">{Widget ? <Widget /> : null}</div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition-colors group-hover:text-foreground">
          Learn more
          <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </motion.div>
  );
}

export function BentoGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="mb-10 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Everything you need to ship agents with confidence.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground text-pretty">
          One SDK, one dashboard. Cost, evals, alerts, agents, traces — purpose-built for the
          Vercel AI SDK.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, i) => (
          <BentoCard key={product.slug} product={product} index={i} />
        ))}
      </div>
    </section>
  );
}
