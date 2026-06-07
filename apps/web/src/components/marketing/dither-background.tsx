import { cn } from "@foglamp/ui/lib/utils";

type DitherBackgroundProps = {
  className?: string;
  /** Texture strength. Kept low; the wrapper also halves it in light mode. */
  opacity?: number;
  /** Varies the noise field so adjacent sections don't look identical. */
  seed?: number;
  /** "fine" = tight grain, "coarse" = larger blotches. */
  variant?: "fine" | "coarse";
};

/**
 * Decorative dithered-noise backdrop. Pure inline SVG (feTurbulence thresholded
 * to a 1-bit-ish dither via feComponentTransfer) so it server-renders with zero
 * JS. Meant to sit absolutely behind content (`absolute inset-0`).
 *
 * Light vs dark: at low opacity on white the raw texture reads as dirt, so we
 * multiply-blend and dim it in light mode, and screen-blend (glow) in dark where
 * it reads as elegant grain against the near-black background.
 */
export function DitherBackground({
  className,
  opacity = 0.05,
  seed = 0,
  variant = "fine",
}: DitherBackgroundProps) {
  const filterId = `dither-${variant}-${seed}`;
  const baseFrequency = variant === "fine" ? 0.85 : 0.4;

  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none h-full w-full",
        "opacity-60 dark:opacity-100",
        "[mix-blend-mode:multiply] dark:[mix-blend-mode:screen]",
        className,
      )}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id={filterId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={baseFrequency}
            numOctaves={3}
            seed={seed}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          {/* Quantize alpha into a few discrete steps → Bayer-dither look. */}
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0 0 0 0 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect
        width="100%"
        height="100%"
        filter={`url(#${filterId})`}
        opacity={opacity}
        className="fill-foreground"
      />
    </svg>
  );
}

/**
 * A single-line ASCII dither strip, used as a section divider. Reads as
 * intentional in both themes (unlike the SVG texture in light mode).
 */
export function AsciiDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden font-mono text-[10px] leading-none whitespace-nowrap select-none text-foreground/10",
        className,
      )}
    >
      {"░▒▓▒░ ▒▓░▒▓ ░▒▓▒░▒ ▓░▒▓░ ".repeat(48)}
    </div>
  );
}
