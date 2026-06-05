import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse the connection across hot reloads in dev to avoid exhausting Postgres.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

// Tuned for a long-running server against Supabase's SESSION pooler (port 5432).
// - `max` — small, capped pool. Concurrent queries beyond this queue inside
//   postgres-js rather than stampeding the pooler; a single-user app never needs
//   more, and a low cap is what keeps a burst of renders from overwhelming the
//   DB (which previously cascaded into statement timeouts that wedged the pool).
// - `idle_timeout` — close idle connections so backends free up; without it
//   postgres-js holds every opened connection and dev hot-reloads accumulate them.
// - `max_lifetime` — periodically recycle connections.
// - `connect_timeout` — fail fast instead of hanging if the DB is unreachable.
// NOTE: prepared statements are left on (session mode supports them). If you ever
// point DATABASE_URL back at the transaction pooler (port 6543), add
// `prepare: false` — pgbouncer transaction mode cannot use prepared statements.
const sql =
  globalForDb.sql ??
  postgres(env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
export { schema };
