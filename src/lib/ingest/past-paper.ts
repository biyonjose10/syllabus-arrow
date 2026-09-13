import { z } from "zod";

/**
 * Validates the model's mapping of a past paper onto the course graph.
 *
 * The model only says "question 3(b) tests eigenvectors". Every id is checked
 * against the real concept list, a question's marks are split evenly across
 * the concepts it tests, and a paper where nothing matched is refused rather
 * than silently weighting nothing.
 */

const Raw = z.object({
  documentType: z.enum(["past_paper", "other"]),
  notPastPaperReason: z.string().nullable(),
  questions: z.array(
    z.object({
      label: z.string(),
      text: z.string(),
      marks: z.number().nullable(),
      conceptIds: z.array(z.string()),
    }),
  ),
});

export type ExamQuestionRow = { conceptSlug: string; label: string; text: string; marks: number | null };

export type PastPaperResult =
  | { ok: true; rows: ExamQuestionRow[]; questions: number; unmatched: number }
  | { ok: false; code: "UNREADABLE" | "NOT_A_PAST_PAPER" | "NO_MATCHES"; message: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function validatePastPaper(raw: string, conceptSlugs: ReadonlySet<string>): PastPaperResult {
  let data: z.infer<typeof Raw>;
  try {
    data = Raw.parse(JSON.parse(raw));
  } catch {
    return { ok: false, code: "UNREADABLE", message: "The reader's answer couldn't be understood." };
  }

  if (data.documentType !== "past_paper") {
    return {
      ok: false,
      code: "NOT_A_PAST_PAPER",
      message: clean(data.notPastPaperReason ?? "") || "This doesn't look like an exam paper.",
    };
  }

  const rows: ExamQuestionRow[] = [];
  let unmatched = 0;
  for (const q of data.questions) {
    const slugs = [...new Set(q.conceptIds.filter((id) => conceptSlugs.has(id)))];
    if (slugs.length === 0) {
      unmatched++;
      continue;
    }
    const marks = q.marks !== null && Number.isFinite(q.marks) && q.marks > 0 ? q.marks / slugs.length : null;
    for (const conceptSlug of slugs) {
      rows.push({ conceptSlug, label: clean(q.label).slice(0, 40), text: clean(q.text).slice(0, 300), marks });
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      code: "NO_MATCHES",
      message: "None of this paper's questions matched this course's topics. Is it the right course?",
    };
  }
  return { ok: true, rows, questions: data.questions.length, unmatched };
}
