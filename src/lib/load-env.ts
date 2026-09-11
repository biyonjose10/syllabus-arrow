/**
 * Loads .env.local for CLI scripts (Prisma, seed, spikes).
 *
 * Next.js does this for the app; tsx and Prisma 7 do not.
 *
 * Existing environment variables always win — the same rule Next applies. That
 * is exactly why the Gemini key is read as SYLLABUS_GEMINI_KEY: this machine's
 * user environment already defines GEMINI_API_KEY, and no env file can
 * override it.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(root: string = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
