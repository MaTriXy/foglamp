"use client";

import { RouteHeader } from "@/components/app/route-header";

/**
 * Shared between loading.tsx and org-settings-client.tsx — see RouteHeader.
 * The description (org name) is only known once the page mounts, so the
 * loading state renders the title alone.
 */
export function OrgSettingsHeader({
  description,
}: {
  description?: React.ReactNode;
}) {
  return (
    <RouteHeader
      href="/settings/org" noIcon
      title="Settings"
      description={description}
    />
  );
}
