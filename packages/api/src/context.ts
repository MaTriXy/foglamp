import { auth } from "@boilerplate/auth";
import { db } from "@boilerplate/db";
import { createLogger, type RequestLogger } from "evlog";
import type { Context as HonoContext } from "hono";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  // Reuse the session the evlog middleware already resolved for this
  // request; only fall back to a fresh lookup if it wasn't set.
  const cachedSession = context.get("session") as SessionResult | undefined;
  const session =
    cachedSession !== undefined
      ? cachedSession
      : await auth.api.getSession({
          headers: context.req.raw.headers,
        });
  const log: RequestLogger =
    (context.get("log") as RequestLogger | undefined) ?? createLogger();
  return {
    db,
    session,
    log,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
