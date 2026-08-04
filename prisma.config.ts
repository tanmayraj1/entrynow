import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * This file configures the Prisma **CLI** — migrate, seed, studio. The runtime
 * client is built separately in `src/lib/db.ts` with a driver adapter, and
 * reads `DATABASE_URL` itself.
 *
 * That split is what makes the two-URL setup work on a pooled host like Neon:
 *
 *   - the **app** uses `DATABASE_URL`, which should be the *pooled* endpoint,
 *     because every serverless instance opens its own `pg` pool;
 *   - the **CLI** prefers `DIRECT_DATABASE_URL`, because `prisma migrate`
 *     needs a session-level connection that PgBouncer cannot provide — schema
 *     changes take advisory locks and run DDL that transaction pooling breaks.
 *
 * Falls back to `DATABASE_URL` when there is no separate direct URL, which is
 * the normal local-Docker case.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
