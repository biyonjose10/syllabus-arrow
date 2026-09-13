/**
 * The demo course — MIT 18.06 Linear Algebra, built from the cached spike
 * extraction and the cached, blind-verified practice questions, so seeding it
 * costs no model calls.
 *
 * MIT's public syllabus lists its midterms without dates, so the demo's dates
 * are illustrative and move forward daily: the schedule is always "live".
 * They are labelled as demo dates on the page.
 */

export const DEMO_EMAIL = "demo@syllabus-arrow.app";
export const DEMO_EXAM_IN_DAYS = 35;
export const DEMO_DATE_LABEL = "Demo date";

export const DEMO_ASSESSMENTS = [
  { title: "Midterm 1", inDays: 12, weight: 10, share: 1 / 3 },
  { title: "Midterm 2", inDays: 24, weight: 10, share: 2 / 3 },
  { title: "Final exam", inDays: DEMO_EXAM_IN_DAYS, weight: 20, share: 1 },
] as const;
