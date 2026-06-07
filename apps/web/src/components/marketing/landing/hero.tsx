import { Button } from "@foglamp/ui/components/button";
import { IconArrowRight, IconBrandOpenai } from "@tabler/icons-react";
import Link from "next/link";

import { CopyButton } from "../copy-button";
import { DitherBackground } from "../dither-background";
import { SETUP_PROMPT } from "../snippets";

export function Hero() {
  return (
    <section className="relative flex flex-col items-center overflow-hidden px-6 pt-20 pb-16 text-center sm:pt-28">
      <DitherBackground
        className="absolute inset-0 -z-10"
        opacity={0.06}
        variant="coarse"
      />

      <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-(--custom-shadow)">
        <IconBrandOpenai className="size-3.5" />
        Built for the Vercel AI SDK
      </span>

      <h1 className="font-display mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
        Don&apos;t ship junk agents.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
        The missing observability layer for the Vercel AI SDK. See cost, latency, traces, and
        eval scores for every call — and catch the junk before your users do.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" render={<Link href="/login" />}>
          Try for free
          <IconArrowRight className="size-4" />
        </Button>
        <CopyButton
          value={SETUP_PROMPT}
          idleLabel="Copy the prompt"
          copiedLabel="Prompt copied"
          size="lg"
          variant="outline"
        />
      </div>
    </section>
  );
}
