import { describe, expect, it } from "vitest";

import type { Edge } from "../src/lib/graph/algorithms";
import { findInsights, type InsightInput } from "../src/lib/mastery/insights";

// eigen → diag → svd ; eigen → spectral
const conceptIds = ["eigen", "diag", "svd", "spectral", "orth"];
const edges: Edge[] = [
  { from: "eigen", to: "diag" },
  { from: "diag", to: "svd" },
  { from: "eigen", to: "spectral" },
];

const answers = (conceptId: string, ...results: boolean[]) => results.map((correct) => ({ conceptId, correct }));

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    conceptIds,
    edges,
    markedDone: new Set(["eigen"]),
    attempts: [],
    examConcepts: new Set(["svd", "spectral", "orth"]),
    ...overrides,
  };
}

describe("findInsights", () => {
  it("fires when a concept marked done has failing dependents, with the exposure numbers", () => {
    const [insight] = findInsights(
      input({ attempts: [...answers("svd", false, false), ...answers("spectral", false, true)] }),
    );
    expect(insight).toMatchObject({
      conceptId: "eigen",
      kind: "DOWNSTREAM",
      attempts: 4,
      wrong: 3,
      examTopicsExposed: 2,
      examTopicsTotal: 3,
    });
    expect(insight.weakestDependents[0]).toMatchObject({ conceptId: "svd", wrong: 2 });
  });

  it("stays silent with too little evidence", () => {
    expect(findInsights(input({ attempts: answers("svd", false, false) }))).toEqual([]);
  });

  it("stays silent when the dependents are mostly answered correctly", () => {
    expect(findInsights(input({ attempts: answers("svd", false, true, true, true) }))).toEqual([]);
  });

  it("never contradicts a claim the student did not make", () => {
    expect(
      findInsights(input({ markedDone: new Set(), attempts: answers("svd", false, false, false, false) })),
    ).toEqual([]);
  });

  it("reports failing questions on the concept itself separately", () => {
    const result = findInsights(input({ attempts: answers("eigen", false, false, true) }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "OWN", attempts: 3, wrong: 2 });
  });

  it("ignores failures on unrelated topics", () => {
    expect(findInsights(input({ attempts: answers("orth", false, false, false) }))).toEqual([]);
  });

  it("ranks by exam weight when past papers exist", () => {
    const result = findInsights(
      input({
        markedDone: new Set(["eigen", "diag"]),
        attempts: answers("svd", false, false, false),
        examWeight: new Map([["svd", 0.5], ["spectral", 0.2]]),
      }),
    );
    expect(result.map((i) => i.conceptId)).toEqual(["eigen", "diag"]);
    expect(result[0].examWeightExposed).toBeCloseTo(0.7);
    expect(result[1].examWeightExposed).toBeCloseTo(0.5);
  });
});
