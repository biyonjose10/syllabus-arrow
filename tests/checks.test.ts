import { describe, expect, it } from "vitest";

import { parseGenerated, parseSolved, reconcile, shuffleOptions, solvePrompt } from "../src/lib/checks/validate";
import { validatePastPaper } from "../src/lib/ingest/past-paper";
import { chooseQuestion } from "../src/lib/mastery/select";
import { examWeights } from "../src/lib/schedule/exam-weight";

const q = (overrides: Record<string, unknown> = {}) => ({
  conceptId: "eigen",
  stem: "What are the eigenvalues of [[2, 0], [0, 3]]?",
  options: ["2 and 3", "0 and 5", "5 and 6", "1 and 6"],
  answerIndex: 0,
  explanation: "Diagonal entries.",
  ...overrides,
});

describe("parseGenerated", () => {
  it("keeps well-formed questions on known concepts only", () => {
    const raw = JSON.stringify({
      questions: [
        q(),
        q({ stem: "A question about a concept that does not exist", conceptId: "ghost" }),
        q({ stem: "Three options is not a valid question", options: ["a", "b", "c"] }),
        q({ stem: "Duplicate options are not a valid question", options: ["a", "a", "b", "c"] }),
        q({ stem: "Out of range answer index here", answerIndex: 4 }),
        q({ stem: "  what are the eigenvalues of [[2, 0], [0, 3]]? " }),
      ],
    });
    const parsed = parseGenerated(raw, new Set(["eigen"]));
    expect(parsed).toHaveLength(1);
  });

  it("returns nothing, rather than throwing, on garbage", () => {
    expect(parseGenerated("nope", new Set(["eigen"]))).toEqual([]);
  });
});

describe("the blind double-solve", () => {
  it("shuffles deterministically and keeps the key pointing at the same option", () => {
    const original = q();
    const shuffled = shuffleOptions(original);
    expect(shuffleOptions(original)).toEqual(shuffled);
    expect(shuffled.options[shuffled.answerIndex]).toBe(original.options[original.answerIndex]);
    expect([...shuffled.options].sort()).toEqual([...original.options].sort());
  });

  it("never shows the key or explanation to the solver", () => {
    const prompt = solvePrompt([q({ explanation: "SECRET-WORKING" })]);
    expect(prompt).not.toContain("SECRET-WORKING");
    expect(prompt).toContain("(3)");
  });

  it("verifies only where both answers agree; unanswered is unverified", () => {
    const questions = [q(), q({ stem: "second question stem", answerIndex: 2 }), q({ stem: "third question stem" })];
    const solved = parseSolved(JSON.stringify({ answers: [{ id: 0, answerIndex: 0 }, { id: 1, answerIndex: 1 }] }));
    expect(reconcile(questions, solved).map((r) => r.verified)).toEqual([true, false, false]);
  });
});

describe("validatePastPaper", () => {
  const slugs = new Set(["eigen", "svd"]);

  it("splits a question's marks across the concepts it tests and drops unknown ids", () => {
    const result = validatePastPaper(
      JSON.stringify({
        documentType: "past_paper",
        notPastPaperReason: null,
        questions: [
          { label: "Q1", text: "Find the eigenvalues", marks: 10, conceptIds: ["eigen", "svd", "ghost"] },
          { label: "Q2", text: "Something off-syllabus", marks: 5, conceptIds: ["ghost"] },
        ],
      }),
      slugs,
    );
    expect(result).toMatchObject({ ok: true, questions: 2, unmatched: 1 });
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { conceptSlug: "eigen", label: "Q1", text: "Find the eigenvalues", marks: 5 },
      { conceptSlug: "svd", label: "Q1", text: "Find the eigenvalues", marks: 5 },
    ]);
  });

  it("refuses a paper where nothing matched, and a document that isn't a paper", () => {
    expect(
      validatePastPaper(JSON.stringify({ documentType: "past_paper", notPastPaperReason: null, questions: [{ label: "Q1", text: "x", marks: 1, conceptIds: [] }] }), slugs),
    ).toMatchObject({ ok: false, code: "NO_MATCHES" });
    expect(
      validatePastPaper(JSON.stringify({ documentType: "other", notPastPaperReason: "Lecture notes.", questions: [] }), slugs),
    ).toEqual({ ok: false, code: "NOT_A_PAST_PAPER", message: "Lecture notes." });
  });
});

describe("examWeights", () => {
  it("is each concept's share of the marks; unmarked questions count as one", () => {
    const w = examWeights([
      { conceptId: "eigen", marks: 6 },
      { conceptId: "svd", marks: 3 },
      { conceptId: "svd", marks: null },
    ]);
    expect(w.get("eigen")).toBeCloseTo(0.6);
    expect(w.get("svd")).toBeCloseTo(0.4);
    expect(examWeights([]).size).toBe(0);
  });
});

describe("chooseQuestion", () => {
  const questions = [
    { id: "q1", conceptId: "a" },
    { id: "q2", conceptId: "b" },
    { id: "q3", conceptId: "c" },
  ];
  const base = { questions, timesAnswered: new Map(), mastery: new Map(), due: new Set<string>(), salt: 1 };

  it("honours an explicit topic", () => {
    expect(chooseQuestion({ ...base, focusConceptId: "c" })).toBe("q3");
  });

  it("prefers unanswered questions, then due topics, and leaves mastered topics last", () => {
    expect(chooseQuestion({ ...base, timesAnswered: new Map([["q1", 1], ["q3", 1]]) })).toBe("q2");
    expect(chooseQuestion({ ...base, due: new Set(["b"]) })).toBe("q2");
    expect(
      chooseQuestion({
        ...base,
        mastery: new Map([
          ["a", { pKnown: 0.95, attempts: 5 }],
          ["b", { pKnown: 0.5, attempts: 2 }],
          ["c", { pKnown: 0.9, attempts: 4 }],
        ]),
      }),
    ).toBe("q2");
  });

  it("returns null when there is nothing to ask", () => {
    expect(chooseQuestion({ ...base, questions: [] })).toBeNull();
  });
});
