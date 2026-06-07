import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import {
  getWorkflowList,
  getWorkflowNames,
} from "../services/workflowRuns";

// Workflows grouped by name (the Workflows grid). A single workflow's runs are
// read through `workflowRuns.list` with a `workflowName` filter; its node graph
// reuses `workflowRuns.get` on the selected run.
export const workflowsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        // Filters.
        workflowName: z.string().optional(),
        errorsOnly: z.boolean().optional(),
        sort: z
          .object({
            field: z.enum([
              "name",
              "runs",
              "traces",
              "tokens",
              "errors",
              "cost",
              "lastRun",
            ]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getWorkflowList(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  // Distinct workflow names in a window — for the workflow-filter dropdown.
  names: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getWorkflowNames(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        from,
        to,
      });
    }),
});
