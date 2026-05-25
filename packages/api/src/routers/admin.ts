import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { ingestTest, listPricing, TEST_KINDS } from "../services/admin";

// Dev tools surfaced behind the (development-only) Admin tab. Procedures stay
// project-access-checked so they remain safe even if reached in production.
export const adminRouter = router({
  // Current in-process OpenRouter pricing table (what ingest prices against).
  pricing: protectedProcedure.query(() => listPricing()),

  // Synthesize + insert test spans for a project (populates the rollup MVs).
  ingestTest: protectedProcedure
    .input(z.object({ projectId: z.string(), kind: z.enum(TEST_KINDS) }))
    .mutation(({ ctx, input }) =>
      ingestTest(ctx.ch, ctx.db, ctx.session.user.id, input),
    ),
});
