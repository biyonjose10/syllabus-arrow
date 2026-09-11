import path from "node:path";
import { defineConfig } from "prisma/config";
import { loadEnv } from "./src/lib/load-env";

// Prisma 7 no longer loads .env itself.
loadEnv();

/**
 * Migrations run over the UNPOOLED connection.
 *
 * Neon's pooled endpoint (`-pooler` in the host) runs PgBouncer in transaction
 * mode, which cannot hold the advisory lock the schema engine needs. The app
 * uses the pooled URL; only the CLI uses this one.
 *
 * Left unset when no variable is present so `prisma generate` still works on a
 * machine with no database configured.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.mts",
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
