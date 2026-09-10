/**
 * The go/no-go spike.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The riskiest assumption in Syllabus→ is that a syllabus contains a
 * dependency graph. It does not. A real syllabus lists *weeks* — "Week 3:
 * Eigenvectors. Week 4: PCA." It almost never states prerequisites. So the
 * edges cannot be extracted; they must be *inferred* from domain knowledge.
 *
 * If that inference fails, what comes back is a straight chain of weeks with
 * arrows on it — a timeline wearing a graph costume. That would take down not
 * just the graph, but the schedule's defensibility and the entire
 * "three exam topics sit downstream of eigenvectors" insight with it.
 *
 * So we answer it in the first hour, against real documents, before any app
 * code exists. Four checks decide the architecture:
 *
 *   1. ACYCLIC       — a prerequisite graph with a cycle is incoherent.
 *   2. MAX IN-DEGREE — a chain has in-degree 1 everywhere. We need > 1
 *                      somewhere, or the model just re-emitted the calendar.
 *   3. DOWNSTREAM    — at least one node with ≥ 3 descendants, or there is
 *                      nothing for the mastery insight to ever say.
 *   4. RATIONALES    — printed for a human to read. This is the real test:
 *                      "you need X to understand Y" is a prerequisite,
 *                      "X is taught in week 2" is a calendar.
 *
 * Usage:  npx tsx scripts/spike-graph.ts <file.pdf> [--two-pass]
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { GoogleGenAI } from "@google/genai";

/**
 * Flash, not the lite tier. Inferring that PCA needs eigenvectors is domain
 * reasoning, not classification, and this is the one call the product is
 * built on. Wrong place to save a fraction of a cent.
 */
const MODEL = "gemini-3.7-flash";

type Concept = { id: string; name: string; summary: string; sourceRef: string };
type Edge = { from: string; to: string; rationale: string };
type Extraction = {
  courseTitle: string;
  concepts: Concept[];
  edges: Edge[];
  assessments: { title: string; dueDate: string | null; weight: number | null }[];
};

/**
 * Schema-constrained because every field here is read by code, never by a
 * person. `dueDate` is a string rather than a date because syllabi say
 * "Week 6" and "TBA" as often as they say a date; normalising is the
 * pipeline's job, not the model's.
 */
const SCHEMA = {
  type: "object",
  required: ["courseTitle", "concepts", "edges", "assessments"],
  properties: {
    courseTitle: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "summary", "sourceRef"],
        properties: {
          id: {
            type: "string",
            description: 'Stable slug, e.g. "eigenvectors". Referenced by edges.',
          },
          name: { type: "string", description: "Human label, 1-4 words." },
          summary: {
            type: "string",
            description: "One sentence: what a student must be able to DO.",
          },
          sourceRef: {
            type: "string",
            description: 'Where in the document this came from, e.g. "Module II" or "Week 4".',
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to", "rationale"],
        properties: {
          from: { type: "string", description: "Concept id of the PREREQUISITE." },
          to: { type: "string", description: "Concept id that DEPENDS on it." },
          rationale: {
            type: "string",
            description:
              "Why 'to' is not learnable without 'from'. Must be a claim about " +
              "understanding, never about ordering in the document.",
          },
        },
      },
    },
    assessments: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "dueDate", "weight"],
        properties: {
          title: { type: "string" },
          // Union with null rather than `nullable`: responseJsonSchema takes
          // the standard JSON Schema dialect, where `nullable` means nothing.
          dueDate: {
            type: ["string", "null"],
            description: 'Verbatim from the document — "Week 6", "TBA", "15 Oct". Null if absent.',
          },
          weight: {
            type: ["number", "null"],
            description: "Percentage of the final grade, if stated. Null if absent.",
          },
        },
      },
    },
  },
} as const;

/**
 * The whole bet is in the negative instructions. Left to itself the model
 * mirrors the document's ordering back, because that ordering is the most
 * salient structure on the page. Every "do not" below exists because it is a
 * failure mode we expect, not because it sounded thorough.
 */
const SYSTEM = `You extract a PREREQUISITE DEPENDENCY GRAPH from a course syllabus.

A syllabus tells you WHEN topics are taught. It does not tell you what depends
on what. That second thing is what you are for, and you must supply it from
your own knowledge of the subject.

CONCEPTS
- Extract the concepts a student must master. Not chapter headings — capabilities.
- 15-40 of them. Split anything that bundles several distinct skills.
- If the document names a topic vaguely ("Applications"), name the real concept.

EDGES — this is the part that matters
- An edge from A to B means: a student who does not understand A CANNOT
  understand B. Not "A is taught first". Not "A is related to B".
- Derive these from the subject itself. You know that PCA requires
  eigenvectors, that backpropagation requires the chain rule, that
  hypothesis testing requires sampling distributions. The syllabus will not
  tell you any of that. Say it anyway.
- Cross-module edges are expected and wanted. Real dependencies routinely
  jump backwards and forwards across a course calendar.
- Most concepts should have MORE THAN ONE prerequisite. A graph where every
  node has exactly one parent is a timeline, and it is wrong.
- Omit an edge you cannot justify. A sparse correct graph beats a dense guess.

RATIONALE
- State the dependency in terms of capability: "you cannot compute a gradient
  through composed functions without the chain rule".
- NEVER write a rationale that refers to weeks, modules, units or ordering.
  If the only reason you can give is "it comes first", the edge is not real —
  drop it.

ASSESSMENTS
- Every exam, quiz, assignment and project, with dates and weights if stated.
- Copy dates verbatim ("Week 6", "TBA", "15 Oct"). Do not invent or normalise.`;

// ── cache ───────────────────────────────────────────────────────────────────

/**
 * Content-addressed, on disk, keyed by everything that could change the answer.
 *
 * This exists on day one rather than day two for a specific reason: the demo
 * gets re-run dozens of times before it is filmed, the checks below get read
 * and re-read, and none of that should cost a token after the first call. Edit
 * the prompt or the schema and the key changes, so a stale answer can never be
 * mistaken for a fresh one. `--fresh` forces a real call.
 */
const CACHE_DIR = join(process.cwd(), ".cache", "spike");

function cacheKey(pdf: Buffer, model: string): string {
  return createHash("sha256")
    .update(pdf)
    .update(model)
    .update(SYSTEM)
    .update(JSON.stringify(SCHEMA))
    .digest("hex")
    .slice(0, 32);
}

function readCache(key: string): { raw: string; meta: CallMeta } | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // a corrupt entry is a cache miss, never a crash
  }
}

function writeCache(key: string, value: { raw: string; meta: CallMeta }): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(value), "utf8");
}

type CallMeta = { elapsed: string; promptTokens?: number; outputTokens?: number };

// ── graph checks ────────────────────────────────────────────────────────────

/** Kahn's algorithm. Returns null when the graph has a cycle. */
function topoSort(ids: string[], edges: Edge[]): string[] | null {
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue; // dangling ref
    indeg.set(e.to, indeg.get(e.to)! + 1);
    out.get(e.from)!.push(e.to);
  }

  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of out.get(id)!) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }

  return order.length === ids.length ? order : null;
}

/** Everything reachable from `id`. The set the mastery insight speaks about. */
function downstream(id: string, edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  const seen = new Set<string>();
  const stack = [...(adj.get(id) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(adj.get(n) ?? []));
  }
  return seen;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/spike-graph.ts <file.pdf>");
    process.exit(1);
  }

  const pdf = readFileSync(path);
  const key = cacheKey(pdf, MODEL);
  const fresh = process.argv.includes("--fresh");
  const hit = fresh ? null : readCache(key);

  console.log(`\n▸ ${basename(path)}  (${(pdf.length / 1024).toFixed(0)} KB)`);
  console.log(`▸ model: ${MODEL}${hit ? "  [cached — no tokens spent]" : ""}\n`);

  let raw: string;
  let meta: CallMeta;

  if (hit) {
    ({ raw, meta } = hit);
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set. Put it in .env.local and re-run.");
      process.exit(1);
    }

    const client = new GoogleGenAI({ apiKey });
    const started = Date.now();

    // The PDF goes to the model whole. Gemini reads page layout natively, which
    // is why there is no pdf-parse / OCR branch here: tables and scans are the
    // normal case for a real syllabus, and a text-layer extractor mangles both.
    const response = await client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
            { text: "Extract the concept dependency graph from this syllabus." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 32_768,
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
      },
    });

    raw = response.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("") ?? "";

    if (!raw.trim()) {
      console.error("Model returned no text. finishReason:", response.candidates?.[0]?.finishReason);
      process.exit(2);
    }

    meta = {
      elapsed: ((Date.now() - started) / 1000).toFixed(1),
      promptTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    };
    writeCache(key, { raw, meta });
  }

  let data: Extraction;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("Model returned non-JSON despite the schema:\n", raw.slice(0, 800));
    process.exit(2);
  }

  const ids = data.concepts.map((c) => c.id);
  const idSet = new Set(ids);
  const dangling = data.edges.filter((e) => !idSet.has(e.from) || !idSet.has(e.to));
  const edges = data.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const maxIn = Math.max(0, ...indeg.values());
  const multiParent = [...indeg.values()].filter((n) => n > 1).length;

  const order = topoSort(ids, edges);
  const downstreamSizes = ids
    .map((id) => ({ id, n: downstream(id, edges).size }))
    .sort((a, b) => b.n - a.n);
  const deepest = downstreamSizes[0] ?? { id: "—", n: 0 };

  // ── verdict ───────────────────────────────────────────────────────────────

  console.log(`  course      ${data.courseTitle}`);
  console.log(`  concepts    ${data.concepts.length}`);
  console.log(`  edges       ${edges.length}${dangling.length ? `  (${dangling.length} dangling, dropped)` : ""}`);
  console.log(`  assessments ${data.assessments.length}`);
  console.log(`  latency     ${meta.elapsed}s`);
  if (meta.promptTokens !== undefined) {
    console.log(`  tokens      in ${meta.promptTokens} / out ${meta.outputTokens}`);
  }

  const checks = [
    { name: "acyclic", pass: order !== null, detail: order ? "topo sort succeeded" : "CYCLE — graph is incoherent" },
    { name: "not a chain", pass: maxIn > 1, detail: `max in-degree ${maxIn}, ${multiParent} nodes have >1 prerequisite` },
    { name: "has depth", pass: deepest.n >= 3, detail: `largest downstream set: "${deepest.id}" → ${deepest.n} concepts` },
    { name: "edge density", pass: edges.length >= data.concepts.length, detail: `${(edges.length / Math.max(1, data.concepts.length)).toFixed(2)} edges per concept` },
  ];

  console.log("");
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name.padEnd(14)} ${c.detail}`);
  }

  // The checks above are arithmetic. This is the one that actually decides:
  // a human reads these and asks whether they are dependencies or a calendar.
  console.log("\n  ── 12 edges, read these ──\n");
  const name = new Map(data.concepts.map((c) => [c.id, c.name]));
  const sample = [...edges].sort(() => Math.random() - 0.5).slice(0, 12);
  for (const e of sample) {
    console.log(`  ${name.get(e.from) ?? e.from}  →  ${name.get(e.to) ?? e.to}`);
    console.log(`      ${e.rationale}\n`);
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(
    failed.length === 0
      ? "  VERDICT: single-pass extraction holds. Build on it.\n"
      : `  VERDICT: ${failed.map((c) => c.name).join(", ")} failed → switch to two-pass.\n`,
  );
}

main().catch((err) => {
  console.error("\nspike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
