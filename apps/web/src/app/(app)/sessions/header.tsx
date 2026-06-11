"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and sessions-client.tsx — see RouteHeader. */
export function SessionsHeader() {
  return (
    <RouteHeader
      href="/sessions"
      title="Sessions"
      description="Multi-turn conversations grouped by sessionId."
    />
  );
}
