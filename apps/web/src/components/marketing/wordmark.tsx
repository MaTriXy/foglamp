"use client";

import { cn } from "@foglamp/ui/lib/utils";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Source PNGs are 2438×480 (~5.08:1). We render at a fixed height and let width
// follow the aspect ratio.
const ASPECT = 2438 / 480;

/**
 * Theme-aware Foglamp wordmark. Renders the dark-on-transparent mark in dark
 * mode and the light variant otherwise. Before the theme is known on the client
 * we reserve the footprint with an invisible placeholder so there's no layout
 * shift (mirrors the mounted-guard pattern in theme-switcher.tsx).
 */
export function Wordmark({
  height = 22,
  className,
  priority,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const width = Math.round(height * ASPECT);

  if (!mounted) {
    return (
      <span
        aria-hidden
        className={cn("inline-block", className)}
        style={{ width, height }}
      />
    );
  }

  const src =
    resolvedTheme === "dark" ? "/wordmark-dark.png" : "/wordmark-light.png";

  return (
    <Image
      src={src}
      alt="Foglamp"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto select-none", className)}
      style={{ height }}
    />
  );
}
