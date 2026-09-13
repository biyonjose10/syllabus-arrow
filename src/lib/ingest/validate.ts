import { z } from "zod";

import { downstream, type Edge } from "../graph/algorithms";

/**
 * Nothing the model says reaches the database until it has been through here.
 *
 * The schema constrains the SHAPE of the model's answer; it cannot constrain
 * whether the answer is coherent. So this module enforces the things the rest
 * of the product assumes and would silently break on:
 *
 *   - every concept has a unique, well-formed slug
 *   - every edge points at concepts that exist, and never at itself
 *   - the graph is ACYCLIC — the scheduler topologically sorts it, and a cycle
 *     would mean "learn A before B before A"
 *   - an assessment only links to concepts that exist
 *
 * A bad edge is dropped and counted, not fatal: one confused rationale should
 * not cost a student their whole upload. What IS fatal is a document that is
 * not a syllabus, or one too thin to plan from — and those get a stable error
 * code the processing screen can explain.
 */

const MIN_CONCEPTS = 3;

const RawExtraction = z.object({
  documentType: z.enum(["syllabus", "past_paper", "other"]),
  notSyllabusReason: z.string().nullable(),
  courseTitle: z.string(),
  termStart: z.string().nullable(),
  concepts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      sourceRef: z.string(),
    }),
  ),
  edges: z.array(z.object({ from: z.string(), to: z.string(), rationale: z.string() })),
  assessments: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      weight: z.number().nullable(),
      conceptIds: z.array(z.string()),
    }),
  ),
});

export type CleanConcept = { slug: string; name: string; summary: string; sourceRef: string };
export type CleanEdge = { from: string; to: string; rationale: string };
export type CleanAssessment = {
  title: string;
  dueDateRaw: string | null;
  weight: number | null;
  conceptSlugs: string[];
};

export type CleanGraph = {
  courseTitle: string;
  termStartRaw: string | null;
  concepts: CleanConcept[];
  edges: CleanEdge[];
  assessments: CleanAssessment[];
};

export type ValidationReport = {
  duplicateConcepts: number;
  danglingEdges: number;
  selfLoops: number;
  duplicateEdges: number;
  /** Edges removed because keeping them would close a cycle. */
  cycleEdges: number;
  danglingAssessmentLinks: number;
};

export type IngestErrorCode = "UNREADABLE" | "NOT_A_SYLLABUS" | "TOO_THIN";

export type ValidationResult =
  | { ok: true; graph: CleanGraph; report: ValidationReport }
  | { ok: false; code: IngestErrorCode; message: string };

/** "Eigen Values & Vectors" → "eigen-values-vectors". Empty when nothing survives. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/_/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function validateExtraction(raw: string): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "UNREADABLE", message: "The reader returned something that wasn't valid data." };
  }

  const parsed = RawExtraction.safeParse(json);
  if (!parsed.success) {
    return { ok: false, code: "UNREADABLE", message: "The reader's answer was missing required fields." };
  }
  const data = parsed.data;

  if (data.documentType !== "syllabus") {
    const kind = data.documentType === "past_paper" ? "an exam paper" : "a syllabus";
    return {
      ok: false,
      code: "NOT_A_SYLLABUS",
      message:
        data.documentType === "past_paper"
          ? "This looks like an exam paper, not a syllabus. Upload the course syllabus first."
          : clean(data.notSyllabusReason ?? "") || `This doesn't look like ${kind}.`,
    };
  }

  const report: ValidationReport = {
    duplicateConcepts: 0,
    danglingEdges: 0,
    selfLoops: 0,
    duplicateEdges: 0,
    cycleEdges: 0,
    danglingAssessmentLinks: 0,
  };

  // ── concepts: one row per slug ────────────────────────────────────────────
  // The model's id is mapped to a normalised slug; edges are resolved through
  // this map, so "Eigenvectors" and "eigenvectors" are the same concept.
  const slugOf = new Map<string, string>();
  const concepts: CleanConcept[] = [];
  const seen = new Set<string>();

  for (const c of data.concepts) {
    const slug = slugify(c.id) || slugify(c.name);
    const name = clean(c.name);
    if (!slug || !name) continue;
    slugOf.set(c.id, slug);
    if (seen.has(slug)) {
      report.duplicateConcepts++;
      continue;
    }
    seen.add(slug);
    concepts.push({
      slug,
      name: name.slice(0, 120),
      summary: clean(c.summary).slice(0, 500),
      sourceRef: clean(c.sourceRef).slice(0, 120),
    });
  }

  if (concepts.length < MIN_CONCEPTS) {
    return {
      ok: false,
      code: "TOO_THIN",
      message: `Only ${concepts.length} topic${concepts.length === 1 ? "" : "s"} could be found — not enough to plan from. Is this the full syllabus?`,
    };
  }

  const resolve = (id: string) => slugOf.get(id) ?? (seen.has(slugify(id)) ? slugify(id) : undefined);

  // ── edges: resolve, dedupe, then keep only those that leave it acyclic ────
  // Edges are admitted in the model's order. An edge from→to closes a cycle
  // exactly when `from` is already reachable from `to`, so it is dropped. The
  // result is deterministic and never loses an edge that was safe to keep.
  const edges: CleanEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const e of data.edges) {
    const from = resolve(e.from);
    const to = resolve(e.to);
    if (!from || !to) {
      report.danglingEdges++;
      continue;
    }
    if (from === to) {
      report.selfLoops++;
      continue;
    }
    const key = `${from}→${to}`;
    if (edgeKeys.has(key)) {
      report.duplicateEdges++;
      continue;
    }
    const current: Edge[] = edges;
    if (downstream(to, current).has(from)) {
      report.cycleEdges++;
      continue;
    }
    edgeKeys.add(key);
    edges.push({ from, to, rationale: clean(e.rationale).slice(0, 500) });
  }

  // ── assessments ───────────────────────────────────────────────────────────
  const assessments: CleanAssessment[] = data.assessments
    .map((a) => {
      const slugs = new Set<string>();
      for (const id of a.conceptIds) {
        const slug = resolve(id);
        if (slug) slugs.add(slug);
        else report.danglingAssessmentLinks++;
      }
      const due = a.dueDate ? clean(a.dueDate) : "";
      return {
        title: clean(a.title).slice(0, 160),
        dueDateRaw: due ? due.slice(0, 80) : null,
        weight: a.weight !== null && Number.isFinite(a.weight) && a.weight >= 0 && a.weight <= 100 ? a.weight : null,
        conceptSlugs: [...slugs],
      };
    })
    .filter((a) => a.title);

  const termStart = data.termStart ? clean(data.termStart) : "";

  return {
    ok: true,
    graph: {
      courseTitle: clean(data.courseTitle).slice(0, 160),
      termStartRaw: termStart || null,
      concepts,
      edges,
      assessments,
    },
    report,
  };
}
