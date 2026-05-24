import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@boilerplate/api/context";
import { appRouter } from "@boilerplate/api/routers/index";
import { auth } from "@boilerplate/auth";
import { env, getTrustedAppOrigins } from "@boilerplate/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { evlog, type AppEnv } from "./evlog";

const app = new Hono<AppEnv>();
const trustedAppOrigins = getTrustedAppOrigins(
  env.CORS_ORIGIN,
  env.CORS_EXTRA_ORIGINS
);

app.use(evlog);
app.use(
  "/*",
  cors({
    origin: trustedAppOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  })
);

app.get("/", (c) => {
  return c.text("OK");
});

// Bun serves a default export with `{ port, fetch }`. The host (Cloud Run,
// Railway, Fly.io, …) injects PORT; falls back to 3000 for local dev.
export default {
  port: env.PORT,
  fetch: app.fetch,
};
