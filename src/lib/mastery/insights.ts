import { downstream, type Edge } from "../graph/algorithms";

/**
 * "You're wrong about yourself."
 *
 * The one place the product contradicts the student, so it is deliberately
 * hard to trigger. An insight fires only when:
 *
 *   - the student has marked the concept done (there is a claim to contradict),
 *   - there are at least MIN_ATTEMPTS answers on the evidence it rests on, and
 *   - at least FAILURE_RATE of them were wrong.
 *
 * Evidence comes in two kinds, reported separately because they say different
 * things:
 *   OWN         — questions on the concept itself.
 *   DOWNSTREAM  — questions on topics that need it. Failing those while
 *                 claiming the prerequisite is the signature of a shaky
 *                 foundation the student hasn't noticed.
 *
 * Only verified, unflagged questions reach this function (the caller filters),
 * so a wrong answer key can never be the thing that contradicts a student.
 *
 * Exposure is stated as "N of M exam topics depend on this", counting the
 * concept itself when it is examined.
 *
 * Pure. No model, no database.
 */

export const MIN_ATTEMPTS = 3;
export const FAILURE_RATE = 0.6;

export type InsightInput = {
  conceptIds: readonly string[];
  edges: readonly Edge[];
  /** Concepts the student marked done. */
  markedDone: ReadonlySet<string>;
  /** Answers on verified, unflagged questions only. */
  attempts: readonly { conceptId: string; correct: boolean }[];
  /** Concepts an assessment or a past paper examines. */
  examConcepts: ReadonlySet<string>;
  /** Optional exam weight per concept (share of past-paper marks, 0–1). */
  examWeight?: ReadonlyMap<string, number>;
};

export type Insight = {
  conceptId: string;
  kind: "OWN" | "DOWNSTREAM";
  attempts: number;
  wrong: number;
  failureRate: number;
  /** Examined topics that rest on this concept, itself included. */
  examTopicsExposed: number;
  examTopicsTotal: number;
  /** Share of past-paper marks exposed, when past papers exist. */
  examWeightExposed: number | null;
  /** DOWNSTREAM only: the dependent topics with the most wrong answers, worst first. */
  weakestDependents: { conceptId: string; attempts: number; wrong: number }[];
};

export function findInsights(input: InsightInput): Insight[] {
  const known = new Set(input.conceptIds);
  const edges = input.edges.filter((e) => known.has(e.from) && known.has(e.to));

  const tally = new Map<string, { attempts: number; wrong: number }>();
  for (const a of input.attempts) {
    if (!known.has(a.conceptId)) continue;
    const t = tally.get(a.conceptId) ?? { attempts: 0, wrong: 0 };
    t.attempts++;
    if (!a.correct) t.wrong++;
    tally.set(a.conceptId, t);
  }

  const examTotal = [...input.examConcepts].filter((id) => known.has(id)).length;
  const insights: Insight[] = [];

  for (const conceptId of input.conceptIds) {
    if (!input.markedDone.has(conceptId)) continue;

    const dependents = downstream(conceptId, edges);
    const exposed = [conceptId, ...dependents];
    const examTopicsExposed = exposed.filter((id) => input.examConcepts.has(id)).length;
    const examWeightExposed = input.examWeight?.size
      ? exposed.reduce((sum, id) => sum + (input.examWeight!.get(id) ?? 0), 0)
      : null;
    const shared = { conceptId, examTopicsExposed, examTopicsTotal: examTotal, examWeightExposed };

    const own = tally.get(conceptId);
    if (own && own.attempts >= MIN_ATTEMPTS && own.wrong / own.attempts >= FAILURE_RATE) {
      insights.push({
        ...shared,
        kind: "OWN",
        attempts: own.attempts,
        wrong: own.wrong,
        failureRate: own.wrong / own.attempts,
        weakestDependents: [],
      });
    }

    let attempts = 0;
    let wrong = 0;
    const perDependent: Insight["weakestDependents"] = [];
    for (const id of dependents) {
      const t = tally.get(id);
      if (!t) continue;
      attempts += t.attempts;
      wrong += t.wrong;
      if (t.wrong > 0) perDependent.push({ conceptId: id, ...t });
    }
    if (attempts >= MIN_ATTEMPTS && wrong / attempts >= FAILURE_RATE) {
      perDependent.sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts);
      insights.push({
        ...shared,
        kind: "DOWNSTREAM",
        attempts,
        wrong,
        failureRate: wrong / attempts,
        weakestDependents: perDependent.slice(0, 3),
      });
    }
  }

  // Most exam exposure first, then the strongest evidence.
  return insights.sort(
    (a, b) =>
      (b.examWeightExposed ?? 0) - (a.examWeightExposed ?? 0) ||
      b.examTopicsExposed - a.examTopicsExposed ||
      b.failureRate - a.failureRate ||
      b.attempts - a.attempts,
  );
}
