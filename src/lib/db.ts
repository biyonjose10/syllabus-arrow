import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The one PrismaClient in the application.
 *
 * Exported as `prismaUnsafe` because that is what it is: a handle with no
 * workspace filter on it. `prismaUnsafe.course.findMany()` returns every
 * student's courses. Only `src/lib/tenancy.ts` (and Better Auth's adapter) may
 * import it; `scripts/verify.mts` fails CI if anything else does.
 *
 * Prisma 7 requires an explicit driver adapter — there is no implicit
 * DATABASE_URL pickup any more. This is the POOLED Neon URL, because serverless
 * invocations open far more connections than Postgres accepts directly.
 * Migrations use the unpooled URL; see prisma.config.ts.
 */

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Run `npx vercel env pull .env.local` after connecting Neon.",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["warn", "error"],
  });
}

// Next's dev server re-evaluates modules on every edit. Without this the
// connection count climbs until Neon refuses new ones.
const globalForPrisma = globalThis as unknown as { prismaUnsafe?: PrismaClient };

/**
 * Constructed on first use, not at import: `next build` imports every route
 * module, and an eager client turns a missing DATABASE_URL into a build
 * failure. Methods are bound to the real client so `$transaction` does not
 * re-enter this trap with the wrong receiver.
 */
export const prismaUnsafe: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    globalForPrisma.prismaUnsafe ??= createClient();
    const client = globalForPrisma.prismaUnsafe;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
