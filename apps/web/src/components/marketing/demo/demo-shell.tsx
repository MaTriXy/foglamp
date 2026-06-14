"use client";

import { cn } from "@foglamp/ui/lib/utils";
import {
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { useRef } from "react";

// Linear-style staged entrance: the whole panel settles, then the sidebar
// surface slides in, then the inset content. Driven by per-group variants with
// `beforeChildren` + a stagger, so the two surfaces animate as wholes (not
// per-row). `useInView({ once })` triggers it the first time the panel scrolls
// into view. Reduced-motion drops the blur and starts everything visible.
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function DemoShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.18,
        delayChildren: 0.1,
      },
    },
  };

  const surface: Variants = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, x: -16, filter: "blur(6px)" },
        show: {
          opacity: 1,
          x: 0,
          filter: "blur(0px)",
          transition: { duration: 0.6, ease: EASE },
        },
      };

  const inset: Variants = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: 0.6, ease: EASE },
        },
      };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={container}
      className={cn(
        // The frame is darker than the page, so a plain dark drop shadow can't
        // ground it and a light rim just paints a bright line across the top.
        // Light keeps the crisp --custom-shadow; dark floats on a pure ambient
        // shadow only (no light edges).
        "relative flex h-[660px] w-full overflow-hidden rounded-3xl corner-squircle bg-sidebar shadow-(--custom-shadow) dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4),0_16px_40px_-12px_rgba(0,0,0,0.55)]"
      )}
    >
      {/* Sidebar surface */}
      <motion.div
        variants={surface}
        style={{ willChange: "transform, opacity, filter" }}
        className="hidden w-56 shrink-0 md:block"
      >
        {sidebar}
      </motion.div>

      {/* Inset content */}
      <motion.div
        variants={inset}
        style={{ willChange: "transform, opacity, filter" }}
        className="relative m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl corner-squircle bg-background shadow-(--custom-shadow) max-md:ml-2 dark:shadow-none"
      >
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-380 flex-col gap-6 p-6 lg:p-8">
            {children}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
