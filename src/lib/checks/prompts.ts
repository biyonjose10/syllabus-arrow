/**
 * Practice questions — the thing the mastery insight stands on.
 *
 * Proven by scripts/spike-checks.ts before any of this was built: 32 generated
 * questions, a second call answering every one BLIND, keep only where both
 * agree. The same method runs in production. A question whose key the blind
 * solve disagrees with is stored unverified and never shown, and never counts.
 */

export const QUESTIONS_PER_CONCEPT = 3;
export const CONCEPTS_PER_BATCH = 10;

export const GENERATE_SYSTEM = `You write multiple-choice practice questions for a university course.

Every question tests EXACTLY ONE concept — the one you are given. A student who
has mastered that concept and its prerequisites must be able to answer it; a
student who has not, must not be able to guess it from wording.

RULES
- Exactly 4 options. Exactly one is correct. No "all of the above", no
  "none of the above", no "both A and B".
- Prefer small concrete problems whose answer you have worked out step by
  step, over definitions and vocabulary.
- Wrong options must be the answers produced by real, common mistakes.
- The explanation shows the working that makes the key correct, in 1-3 sentences.
- Plain text only. No LaTeX, no Markdown. Write maths with Unicode: x², √2,
  λ, ≤, ×, A⁻¹, and matrices as [[1, 2], [3, 4]].
- If you are not certain of the answer, do not write the question.`;

export const GENERATE_SCHEMA = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["conceptId", "stem", "options", "answerIndex", "explanation"],
        properties: {
          conceptId: { type: "string", description: "Exactly one of the given concept ids." },
          stem: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          answerIndex: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

export function solveSystem(courseTitle: string): string {
  return `You are sitting an exam for the course "${courseTitle}". Work every problem
out carefully, step by step, before choosing. Answer every question. Pick
exactly one option index (0-3) for each.`;
}

export const SOLVE_SCHEMA = {
  type: "object",
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "answerIndex"],
        properties: {
          id: { type: "integer" },
          answerIndex: { type: "integer", minimum: 0, maximum: 3 },
        },
      },
    },
  },
} as const;

/**
 * Past papers: each exam question mapped onto the existing graph. The model
 * only matches; the exam weight per concept is arithmetic in code.
 */
export const PAST_PAPER_SYSTEM = `You map the questions on an exam paper onto a course's concept list.

FIRST, CLASSIFY THE DOCUMENT
- "past_paper": an exam, test or quiz paper with questions.
- "other": anything else. Then return no questions and say why in notPastPaperReason.

FOR EACH QUESTION (use the paper's own numbering; split parts that test different things)
- text: the question's opening words, verbatim, at most 200 characters.
- marks: the marks shown for it, or null if none are shown.
- conceptIds: the 1-2 concepts from the given list a student must know to answer
  it. Only ids from the list. If none fit, use an empty list.`;

export const PAST_PAPER_SCHEMA = {
  type: "object",
  required: ["documentType", "notPastPaperReason", "questions"],
  properties: {
    documentType: { type: "string", enum: ["past_paper", "other"] },
    notPastPaperReason: { type: ["string", "null"] },
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "text", "marks", "conceptIds"],
        properties: {
          label: { type: "string", description: 'The paper\'s numbering, e.g. "Q3(b)".' },
          text: { type: "string" },
          marks: { type: ["number", "null"] },
          conceptIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
