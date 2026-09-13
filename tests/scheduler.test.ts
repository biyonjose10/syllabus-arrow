import { describe, expect, it } from "vitest";

import type { Edge } from "../src/lib/graph/algorithms";
import { addDays } from "../src/lib/schedule/dates";
import { buildSchedule, REVIEW_MINUTES, type ScheduleInput } from "../src/lib/schedule/scheduler";

const start = new Date("2026-09-14T00:00:00Z");
const ids = ["elimination", "subspaces", "determinants", "eigen", "diagonalization", "svd", "orthogonality"];
const edges: Edge[] = [
  { from: "elimination", to: "subspaces" },
  { from: "elimination", to: "determinants" },
  { from: "determinants", to: "eigen" },
  { from: "subspaces", to: "eigen" },
  { from: "eigen", to: "diagonalization" },
  { from: "diagonalization", to: "svd" },
  { from: "orthogonality", to: "svd" },
];

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    conceptIds: ids,
    edges,
    assessments: [],
    examDate: addDays(start, 30),
    start,
    minutesPerDay: 60,
    ...overrides,
  };
}

const learnItems = (r: ReturnType<typeof buildSchedule>) =>
  r.status === "OK" ? r.items.filter((i) => i.kind === "LEARN") : [];

describe("buildSchedule", () => {
  it("never schedules a concept before any of its prerequisites", () => {
    const result = buildSchedule(input());
    const learn = learnItems(result);
    expect(learn).toHaveLength(ids.length);
    const position = new Map(learn.map((i, n) => [i.conceptId, { day: i.date.getTime(), n }]));
    for (const e of edges) {
      const from = position.get(e.from)!;
      const to = position.get(e.to)!;
      expect(from.day).toBeLessThanOrEqual(to.day);
      expect(from.n).toBeLessThan(to.n);
    }
  });

  it("meets every deadline when there is time, and says so", () => {
    const result = buildSchedule(input());
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.lateConcepts).toBe(0);
    for (const item of learnItems(result)) expect(item.date.getTime()).toBeLessThan(item.deadline.getTime());
  });

  it("pulls prerequisites of an early quiz ahead of unrelated topics", () => {
    const quiz = addDays(start, 5);
    const result = buildSchedule(
      input({ assessments: [{ dueDate: quiz, conceptIds: ["eigen"] }] }),
    );
    const learn = learnItems(result);
    const order = learn.map((i) => i.conceptId);
    // Everything eigen needs, and eigen itself, before orthogonality (not on the quiz).
    for (const id of ["elimination", "subspaces", "determinants", "eigen"]) {
      expect(order.indexOf(id)).toBeLessThan(order.indexOf("orthogonality"));
    }
    for (const id of ["elimination", "subspaces", "determinants", "eigen"]) {
      const item = learn.find((i) => i.conceptId === id)!;
      expect(item.deadline.getTime()).toBe(quiz.getTime());
      expect(item.lateByDays).toBe(0);
    }
  });

  it("reports lateness honestly instead of hiding work when time runs out", () => {
    const result = buildSchedule(input({ examDate: addDays(start, 2), minutesPerDay: 30 }));
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(learnItems(result)).toHaveLength(ids.length);
    expect(result.lateConcepts).toBeGreaterThan(0);
  });

  it("never exceeds the daily minutes with learning", () => {
    const result = buildSchedule(input({ minutesPerDay: 45 }));
    const perDay = new Map<number, number>();
    for (const i of learnItems(result)) perDay.set(i.date.getTime(), (perDay.get(i.date.getTime()) ?? 0) + i.minutes);
    for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(45);
  });

  it("places reviews after learning and before the final deadline", () => {
    const result = buildSchedule(input());
    if (result.status !== "OK") throw new Error("expected a plan");
    const learned = new Map(learnItems(result).map((i) => [i.conceptId, i.date.getTime()]));
    const reviews = result.items.filter((i) => i.kind === "REVIEW");
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) {
      expect(r.minutes).toBe(REVIEW_MINUTES);
      expect(r.date.getTime()).toBeGreaterThan(learned.get(r.conceptId)!);
      expect(r.date.getTime()).toBeLessThan(result.finalDeadline.getTime());
    }
  });

  it("returns NO_DATES when nothing in the future anchors the plan", () => {
    expect(buildSchedule(input({ examDate: null })).status).toBe("NO_DATES");
    expect(
      buildSchedule(input({ examDate: addDays(start, -3), assessments: [{ dueDate: addDays(start, -1), conceptIds: ids }] }))
        .status,
    ).toBe("NO_DATES");
  });

  it("uses the latest future assessment when no exam date is set", () => {
    const result = buildSchedule(input({ examDate: null, assessments: [{ dueDate: addDays(start, 20), conceptIds: ["eigen"] }] }));
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.finalDeadline.getTime()).toBe(addDays(start, 20).getTime());
  });

  it("is deterministic", () => {
    expect(buildSchedule(input())).toEqual(buildSchedule(input()));
  });
});
