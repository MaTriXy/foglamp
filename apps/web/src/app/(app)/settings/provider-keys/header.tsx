"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and provider-keys-client.tsx — see RouteHeader. */
export function ProviderKeysHeader() {
  return (
    <RouteHeader
      href="/settings/provider-keys" noIcon
      title="Provider Keys"
      description="Bring-your-own-key for LLM judges. Keys are encrypted at rest and never shown again."
    />
  );
}
