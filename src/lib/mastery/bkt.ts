/**
 * Bayesian Knowledge Tracing (Corbett & Anderson, 1994).
 *
 * One hidden bit per student per concept — known or not — and four published
 * parameters. After each answer, Bayes' rule updates the probability the
 * concept is known given whether the answer was right, then allows for
 * learning having happened during the attempt.
 *
 * Why this and not "% correct": a lucky guess on a 4-option question should
 * move belief less than a correct answer usually does, one slip should not
 * erase a run of right answers, and a student with no attempts is "unknown",
 * not "0%". BKT gets all three from the parameters below.
 *
 * Pure. No model, no database — `npm run verify` enforces it.
 */

export const BKT = {
  /** P(L0): known before any practice. Low — the course is being learned. */
  pInit: 0.2,
  /** P(T): learned during one attempt (practice with feedback). */
  pTransit: 0.15,
  /** P(S): wrong despite knowing it. */
  pSlip: 0.1,
  /** P(G): right without knowing it. One in four options. */
  pGuess: 0.25,
} as const;

/** At or above this, a concept counts as mastered. */
export const MASTERED = 0.85;
/** Below this, with evidence, a concept counts as not known. */
export const STRUGGLING = 0.4;

export type BktParams = { pInit: number; pTransit: number; pSlip: number; pGuess: number };

/** One observed answer → the new P(known). */
export function bktUpdate(pKnown: number, correct: boolean, params: BktParams = BKT): number {
  const { pTransit, pSlip, pGuess } = params;
  const evidence = correct
    ? (pKnown * (1 - pSlip)) / (pKnown * (1 - pSlip) + (1 - pKnown) * pGuess)
    : (pKnown * pSlip) / (pKnown * pSlip + (1 - pKnown) * (1 - pGuess));
  const next = evidence + (1 - evidence) * pTransit;
  return Math.min(0.9999, Math.max(0.0001, next));
}

/** Replays answers in order from the prior. Used after a question is flagged. */
export function bktReplay(answers: readonly boolean[], params: BktParams = BKT): number {
  return answers.reduce((p, correct) => bktUpdate(p, correct, params), params.pInit);
}

export type MasteryBand = "unseen" | "struggling" | "learning" | "mastered";

export function masteryBand(pKnown: number | null | undefined, attempts: number): MasteryBand {
  if (!attempts || pKnown === null || pKnown === undefined) return "unseen";
  if (pKnown >= MASTERED) return "mastered";
  if (pKnown < STRUGGLING) return "struggling";
  return "learning";
}
