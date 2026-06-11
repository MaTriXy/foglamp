"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and evals-client.tsx — see RouteHeader. */
export function EvalsHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <RouteHeader
      href="/evals"
      title="Evals"
      description="Score production traces and spans with code checks and LLM-as-a-judge."
      actions={actions}
    />
  );
}
