"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and traces-client.tsx — see RouteHeader. */
export function TracesHeader() {
  return (
    <RouteHeader
      href="/traces"
      title="Traces"
      description="Each trace is one top-level generateText / streamText call."
    />
  );
}
