import { MASTERED } from "./bkt";

/**
 * Picks the next practice question. Pure, deterministic for a given `salt`.
 *
 * Priority, in order:
 *   1. a topic the student asked for (from the map or schedule), if it has questions
 *   2. questions the student has answered fewest times — new before repeated
 *   3. topics due today or earlier on the schedule
 *   4. topics never practised, then the lowest P(known)
 *   5. mastered topics last
 */
export function chooseQuestion(input: {
  questions: readonly { id: string; conceptId: string }[];
  timesAnswered: ReadonlyMap<string, number>;
  mastery: ReadonlyMap<string, { pKnown: number; attempts: number }>;
  due: ReadonlySet<string>;
  focusConceptId?: string | null;
  salt: number;
}): string | null {
  let pool = input.questions;
  if (input.focusConceptId) {
    const focused = pool.filter((q) => q.conceptId === input.focusConceptId);
    if (focused.length) pool = focused;
  }
  if (pool.length === 0) return null;

  const jitter = (id: string) => {
    let h = input.salt >>> 0;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
    return h;
  };

  const score = (q: { id: string; conceptId: string }): number[] => {
    const m = input.mastery.get(q.conceptId);
    const pKnown = m?.attempts ? m.pKnown : -1; // never practised sorts before any evidence
    return [
      input.timesAnswered.get(q.id) ?? 0,
      input.due.has(q.conceptId) ? 0 : 1,
      pKnown >= MASTERED ? 1 : 0,
      pKnown,
      jitter(q.id),
    ];
  };

  const ranked = pool.map((q) => ({ q, s: score(q) }));
  ranked.sort((a, b) => {
    for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
    return 0;
  });
  return ranked[0].q.id;
}
