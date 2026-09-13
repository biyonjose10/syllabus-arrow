/**
 * Structural invariants. Run in CI before tests.
 *
 * These are the promises the product makes that no unit test would notice
 * breaking. Each is checked from the import graph and the source text, not
 * from anyone's discipline.
 *
 *   1. TENANCY     Only the tenancy layer and Better Auth's adapter hold the
 *                  raw Prisma client. Everything else must say whose data it
 *                  wants by passing a WorkspaceContext.
 *   2. NO MODEL    Mastery, schedule, graph and plan limits never reach a model
 *   IN DECISIONS   client, even transitively. The model writes the map and the
 *                  questions; code decides what a student knows.
 *   3. PAID KEY    Nothing reads GEMINI_API_KEY. On the dev machine that name is
 *                  inherited from the user environment and is a different,
 *                  paid key that no env file can override.
 *
 * Usage: npx tsx scripts/verify.mts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const ROOT = process.cwd();

const toPosix = (p: string) => p.split("\\").join("/");

function sourceFiles(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .map((f) => toPosix(join(dir, f)))
    .filter((f) => /\.(ts|tsx|mts)$/.test(f) && !f.includes("node_modules"));
}

const files = [...sourceFiles("src"), ...sourceFiles("scripts"), ...sourceFiles("prisma")];

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** Module id without extension: "src/lib/db", or a bare package name. */
function resolve(fromFile: string, spec: string): string {
  let target: string;
  if (spec.startsWith("@/")) target = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) target = toPosix(normalize(join(dirname(fromFile), spec)));
  else return spec;

  for (const ext of [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"]) {
    if (existsSync(join(ROOT, target + ext))) return toPosix(target + ext).replace(/(\/index)?\.(ts|tsx|mts)$/, "");
  }
  return target.replace(/\.(m?js|ts|tsx|mts)$/, "");
}

const stripExt = (f: string) => f.replace(/\.(ts|tsx|mts)$/, "");

const imports = new Map<string, string[]>();
const text = new Map<string, string>();
for (const file of files) {
  const src = readFileSync(join(ROOT, file), "utf8");
  text.set(file, src);
  const specs = [...src.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
  imports.set(stripExt(file), specs.map((s) => resolve(file, s)));
}

type Result = { name: string; failures: string[] };
const results: Result[] = [];

// ── 1. tenancy ──────────────────────────────────────────────────────────────

const DB_HOLDERS = new Set([
  "src/lib/tenancy", // the boundary itself
  "src/lib/auth", // Better Auth's Prisma adapter needs the raw client
  "src/lib/llm/cache", // LlmCache + GlobalCounter: the only tables with no workspace, by design
]);

results.push({
  name: "tenancy",
  failures: [...imports]
    .filter(([file, deps]) => deps.includes("src/lib/db") && !DB_HOLDERS.has(file) && file !== "src/lib/db")
    .map(([file]) => `${file} imports the raw Prisma client — go through src/lib/tenancy.ts`),
});

// ── 2. no model in decisions ────────────────────────────────────────────────

const DECISION_ROOTS = files
  .map(stripExt)
  .filter((f) => /^src\/lib\/(mastery|schedule|graph)\//.test(f) || f === "src/lib/plans");

const isModel = (id: string) => id === "@google/genai" || id.startsWith("src/lib/llm");

function modelPath(start: string): string[] | null {
  const stack: [string, string[]][] = [[start, [start]]];
  const seen = new Set<string>();
  while (stack.length) {
    const [node, path] = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const dep of imports.get(node) ?? []) {
      if (isModel(dep)) return [...path, dep];
      if (imports.has(dep)) stack.push([dep, [...path, dep]]);
    }
  }
  return null;
}

results.push({
  name: "no model in decisions",
  failures: DECISION_ROOTS.flatMap((root) => {
    const path = modelPath(root);
    return path ? [`${path.join(" → ")}`] : [];
  }),
});

// ── 3. paid key ─────────────────────────────────────────────────────────────

results.push({
  name: "paid key",
  failures: files
    .filter((f) => /process\.env\.GEMINI_API_KEY|process\.env\[["']GEMINI_API_KEY["']\]/.test(text.get(f)!))
    .map((f) => `${f} reads GEMINI_API_KEY — use SYLLABUS_GEMINI_KEY`),
});

// ── report ──────────────────────────────────────────────────────────────────

console.log(`\nverify — ${files.length} files, ${DECISION_ROOTS.length} decision modules\n`);
for (const r of results) {
  console.log(`  ${r.failures.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const f of r.failures) console.log(`          ${f}`);
}
console.log("");

if (results.some((r) => r.failures.length)) process.exit(1);
