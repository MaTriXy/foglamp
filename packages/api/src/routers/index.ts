import { publicProcedure, router } from "../index";
import { adminRouter } from "./admin";
import { agentsRouter } from "./agents";
import { alertsRouter } from "./alerts";
import { metricsRouter } from "./metrics";
import { pricingRouter } from "./pricing";
import { projectsRouter } from "./projects";
import { tracesRouter } from "./traces";
import { workflowRunsRouter } from "./workflowRuns";
import { workflowsRouter } from "./workflows";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  projects: projectsRouter,
  traces: tracesRouter,
  workflows: workflowsRouter,
  workflowRuns: workflowRunsRouter,
  agents: agentsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
  pricing: pricingRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
