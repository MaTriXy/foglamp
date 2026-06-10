import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  getPlatformStats,
  grantOrgAccess,
  isPlatformAdmin,
  listAccessGrants,
  revokeOrgAccess,
  searchOrgs,
} from "../services/platform";

// Operator-only platform stats. Allowlist by email (PLATFORM_ADMIN_EMAILS);
// unset → hidden for everyone (the self-host default).
const platformAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isPlatformAdmin(ctx.session.user.email)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const platformRouter = router({
  // Cheap probe the sidebar uses to decide whether to show the entry point.
  isAdmin: protectedProcedure.query(({ ctx }) =>
    isPlatformAdmin(ctx.session.user.email),
  ),

  stats: platformAdminProcedure.query(({ ctx }) =>
    getPlatformStats(ctx.db, ctx.ch),
  ),

  searchOrgs: platformAdminProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => searchOrgs(ctx.db, input.query)),

  accessGrants: platformAdminProcedure.query(({ ctx }) =>
    listAccessGrants(ctx.db),
  ),

  grantAccess: platformAdminProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        // Days from now; null = no expiry.
        days: z.number().int().min(1).max(3650).nullable(),
      }),
    )
    .mutation(({ ctx, input }) => grantOrgAccess(ctx.db, input)),

  revokeAccess: platformAdminProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .mutation(({ ctx, input }) => revokeOrgAccess(ctx.db, input.orgId)),
});
