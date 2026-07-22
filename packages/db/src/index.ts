import { env } from "@foglamp/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export function createDb() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  // When the server side drops an idle pooled connection (Cloud SQL reaps
  // them; proxies/tunnels too), pg emits 'error' on the pool. With no listener
  // that's an uncaught event that crashes the whole process — the client is
  // already purged from the pool, so logging is all that's left to do.
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
