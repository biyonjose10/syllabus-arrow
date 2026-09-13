import { describe, expect, it } from "vitest";

import { topoSort } from "../src/lib/graph/algorithms";
import { slugify, validateExtraction } from "../src/lib/ingest/validate";

const concept = (id: string) => ({ id, name: id.toUpperCase(), summary: `Do ${id}`, sourceRef: "Week 1" });

function extraction(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    documentType: "syllabus",
    notSyllabusReason: null,
    courseTitle: "  Linear   Algebra ",
    termStart: null,
    concepts: ["a", "b", "c", "d"].map(concept),
    edges: [
      { from: "a", to: "b", rationale: "b needs a" },
      { from: "b", to: "c", rationale: "c needs b" },
    ],
    assessments: [{ title: "Final", dueDate: "15 Dec", weight: 40, conceptIds: ["a", "b", "c", "d"] }],
    ...overrides,
  });
}

describe("validateExtraction", () => {
  it("passes a clean graph through, normalising whitespace", () => {
    const result = validateExtraction(extraction());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.graph.courseTitle).toBe("Linear Algebra");
    expect(result.graph.concepts.map((c) => c.slug)).toEqual(["a", "b", "c", "d"]);
    expect(result.graph.edges).toHaveLength(2);
    expect(result.graph.assessments[0]).toMatchObject({ dueDateRaw: "15 Dec", conceptSlugs: ["a", "b", "c", "d"] });
  });

  it("drops the edge that would close a cycle, and the result sorts", () => {
    const result = validateExtraction(
      extraction({
        edges: [
          { from: "a", to: "b", rationale: "" },
          { from: "b", to: "c", rationale: "" },
          { from: "c", to: "a", rationale: "closes the loop" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.cycleEdges).toBe(1);
    const ids = result.graph.concepts.map((c) => c.slug);
    expect(topoSort(ids, result.graph.edges)).not.toBeNull();
  });

  it("drops dangling edges, self loops and duplicates, and counts each", () => {
    const result = validateExtraction(
      extraction({
        edges: [
          { from: "a", to: "b", rationale: "" },
          { from: "A", to: "b", rationale: "same edge, different case" },
          { from: "a", to: "ghost", rationale: "" },
          { from: "c", to: "c", rationale: "" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.graph.edges).toHaveLength(1);
    expect(result.report).toMatchObject({ duplicateEdges: 1, danglingEdges: 1, selfLoops: 1 });
  });

  it("merges concepts whose ids normalise to the same slug", () => {
    const result = validateExtraction(
      extraction({ concepts: [concept("Eigen Vectors"), concept("eigen-vectors"), concept("b"), concept("c")] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.duplicateConcepts).toBe(1);
    expect(result.graph.concepts.map((c) => c.slug)).toEqual(["eigen-vectors", "b", "c"]);
  });

  it("refuses a document that is not a syllabus, with a stable code", () => {
    const result = validateExtraction(
      extraction({ documentType: "other", notSyllabusReason: "These are lecture slides.", concepts: [], edges: [] }),
    );
    expect(result).toEqual({ ok: false, code: "NOT_A_SYLLABUS", message: "These are lecture slides." });
  });

  it("refuses a graph too thin to plan from", () => {
    const result = validateExtraction(extraction({ concepts: [concept("a")], edges: [], assessments: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TOO_THIN");
  });

  it("treats non-JSON and missing fields as unreadable, never a crash", () => {
    expect(validateExtraction("not json")).toMatchObject({ ok: false, code: "UNREADABLE" });
    expect(validateExtraction(JSON.stringify({ concepts: [] }))).toMatchObject({ ok: false, code: "UNREADABLE" });
  });

  it("slugifies to something URL-safe", () => {
    expect(slugify("Eigen Values & Vectors")).toBe("eigen-values-vectors");
    expect(slugify("  ")).toBe("");
  });
});
