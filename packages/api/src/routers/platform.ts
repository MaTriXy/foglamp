import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../index";
import { getPlatformStats, isPlatformAdmin } from "../services/platform";

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
});
