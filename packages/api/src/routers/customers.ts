import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import { getCustomerList } from "../services/customers";

export const customersRouter = router({
  // Per-customer cost rollup for the Overview "Customers" card (cost desc).
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        includeUnidentified: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getCustomerList(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        from,
        to,
        includeUnidentified: input.includeUnidentified,
        limit: input.limit,
      });
    }),
});
