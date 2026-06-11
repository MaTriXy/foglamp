"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and overview-client.tsx — see RouteHeader. */
export function OverviewHeader() {
  return (
    <RouteHeader
      href="/overview"
      title="Overview"
      description="Cost, reliability, latency, and usage across this project."
      withRange
    />
  );
}
