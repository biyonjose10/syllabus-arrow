import { z } from "zod";

/**
 * The blind double-solve, as code.
 *
 *   generated questions ─► well-formed? concept id real? ─► options shuffled
 *                         deterministically ─► blind solve ─► keep only where
 *                         the key and the blind answer agree.
 *
 * The shuffle matters: generators habitually put the answer first, and a blind
 * solver that also leans to option A would "agree" for the wrong reason.
 */

export type GeneratedQuestion = {
  conceptId: string;
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

const Generated = z.object({
  questions: z.array(
    z.object({
      conceptId: z.string(),
      stem: z.string(),
      options: z.array(z.string()),
      answerIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

const Solved = z.object({ answers: z.array(z.object({ id: z.number().int(), answerIndex: z.number().int() })) });

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Drops anything malformed: wrong option count, duplicate options, unknown concept, repeated stem. */
export function parseGenerated(raw: string, allowedConceptIds: ReadonlySet<string>): GeneratedQuestion[] {
  let parsed: z.infer<typeof Generated>;
  try {
    parsed = Generated.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const stems = new Set<string>();
  const out: GeneratedQuestion[] = [];
  for (const q of parsed.questions) {
    const stem = clean(q.stem);
    const options = q.options.map(clean);
    if (!allowedConceptIds.has(q.conceptId)) continue;
    if (stem.length < 8 || stems.has(stem.toLowerCase())) continue;
    if (options.length !== 4 || options.some((o) => !o) || new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    if (q.answerIndex < 0 || q.answerIndex > 3) continue;
    stems.add(stem.toLowerCase());
    out.push({ conceptId: q.conceptId, stem, options, answerIndex: q.answerIndex, explanation: clean(q.explanation) });
  }
  return out;
}

/** FNV-1a: a stable 32-bit seed from the stem, no crypto import needed. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Same stem → same order, every time, so cached solves stay valid. */
export function shuffleOptions(q: GeneratedQuestion): GeneratedQuestion {
  const order = q.options.map((_, i) => i);
  let seed = seedOf(q.stem);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) };
}

/** What the blind solver sees: numbered questions, never the key or the explanation. */
export function solvePrompt(questions: readonly GeneratedQuestion[]): string {
  return questions
    .map((q, i) => `Q${i}\n${q.stem}\n${q.options.map((o, j) => `  (${j}) ${o}`).join("\n")}`)
    .join("\n\n");
}

export function parseSolved(raw: string): Map<number, number> {
  try {
    return new Map(Solved.parse(JSON.parse(raw)).answers.map((a) => [a.id, a.answerIndex]));
  } catch {
    return new Map();
  }
}

/** Verified only where both independent answers agree. Unanswered = unverified. */
export function reconcile(questions: readonly GeneratedQuestion[], solved: ReadonlyMap<number, number>) {
  return questions.map((q, i) => ({ ...q, verified: solved.get(i) === q.answerIndex }));
}
