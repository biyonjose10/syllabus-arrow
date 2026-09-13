/**
 * The processing screen's steps, in order. Each is one Inngest step, and each
 * writes its index to IngestJob as it starts — so the progress a student sees
 * is the job's real position, never a timer.
 */
export const INGEST_STEPS = [
  "Reading your PDF",
  "Mapping topics and prerequisites",
  "Checking the map for loops and gaps",
  "Saving your course map",
  "Building your schedule",
] as const;

export const PAST_PAPER_STEPS = [
  "Reading your PDF",
  "Matching exam questions to topics",
  "Checking the matches",
  "Saving exam weights",
  "Re-planning with exam weights",
] as const;

export function stepsFor(kind: "SYLLABUS" | "PAST_PAPER"): readonly string[] {
  return kind === "PAST_PAPER" ? PAST_PAPER_STEPS : INGEST_STEPS;
}

/** Stable failure codes → what the student is told. */
export const INGEST_ERRORS: Record<string, { title: string; hint: string }> = {
  WRONG_FORMAT: {
    title: "That file isn't a PDF",
    hint: "Syllabus→ reads PDFs for now. In Word or Google Docs, use File → Download → PDF, then upload that.",
  },
  NOT_A_SYLLABUS: {
    title: "This doesn't look like a syllabus",
    hint: "Upload the course outline or scheme of study — the document that lists the topics.",
  },
  NOT_A_PAST_PAPER: {
    title: "This doesn't look like an exam paper",
    hint: "Upload a past exam or test for this course — the paper with the questions on it.",
  },
  NO_MATCHES: {
    title: "None of the paper's questions matched this course",
    hint: "Check it's a paper for this course. Exam weights only come from questions that map onto the course map.",
  },
  NEEDS_SYLLABUS: {
    title: "Upload the syllabus first",
    hint: "Past papers are matched against the course map, so the map has to exist.",
  },
  TOO_THIN: {
    title: "Not enough topics to plan from",
    hint: "Check it's the full syllabus, not a cover page or a single week.",
  },
  UNREADABLE: {
    title: "The syllabus couldn't be read",
    hint: "Try again. If it keeps happening, the PDF may be a scan with very little text.",
  },
  AT_CAPACITY: {
    title: "We're at today's reading capacity",
    hint: "Syllabus→ caps how many documents it reads per day on its free AI key. Try again tomorrow, or open the demo course.",
  },
  READER_ERROR: {
    title: "The reader refused this document",
    hint: "Try again in a minute. If it keeps happening, try a smaller PDF.",
  },
  MISSING_FILE: {
    title: "The upload went missing",
    hint: "Upload the PDF again.",
  },
  WORKER_UNAVAILABLE: {
    title: "The background worker is unavailable",
    hint: "Your file is saved. Upload it again in a few minutes.",
  },
  FAILED: {
    title: "Something went wrong reading this",
    hint: "Upload it again. Nothing was charged against your plan for a failed read.",
  },
};
