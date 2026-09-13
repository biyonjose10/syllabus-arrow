/**
 * Turns the dates a syllabus actually contains into calendar days — or into
 * nothing, honestly.
 *
 * The model copies dates verbatim ("Week 6", "15 Oct", "TBA") and this module
 * decides what they mean. It is deliberately conservative: a date that could
 * be read two ways ("03/04") is `null`, never a guess, because a wrong exam date
 * produces a schedule that is confidently wrong. A `null` becomes the
 * "no dates found — set your exam date" state instead.
 *
 * Every Date returned is midnight UTC. Imports nothing.
 */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export const DAY_MS = 86_400_000;

/** Midnight UTC of the given instant's UTC day. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS);
}

function valid(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  // Rejects 31 Feb, which Date.UTC would silently roll into March.
  return d.getUTCMonth() === month && d.getUTCDate() === day ? d : null;
}

/**
 * A day and month with no year: the first occurrence on or after two months
 * before `reference`. A student uploading in September means this December and
 * next February, and still means last month's quiz rather than next year's.
 */
function withInferredYear(month: number, day: number, reference: Date): Date | null {
  const floor = addDays(utcDay(reference), -60);
  for (const year of [floor.getUTCFullYear(), floor.getUTCFullYear() + 1]) {
    const d = valid(year, month, day);
    if (d && d >= floor) return d;
  }
  return null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

export type DateContext = {
  /** "Now" — the upload time. Anchors year inference. */
  reference: Date;
  /** First day of term, if known. Needed to resolve "Week 6". */
  termStart?: Date | null;
};

/**
 * Parses one verbatim date. Returns `null` for anything absent, relative
 * without an anchor, or ambiguous. Ranges ("Oct 15-17") resolve to their first day.
 */
export function parseSyllabusDate(raw: string | null | undefined, ctx: DateContext): Date | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  // 2026-10-15
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // 15/10/2026, 15-10-26 — only when the day/month order is unambiguous.
  m = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = fullYear(m[3]);
    if (a > 12 && b <= 12) return valid(year, b - 1, a);
    if (b > 12 && a <= 12) return valid(year, a - 1, b);
    if (a === b) return valid(year, a - 1, b);
    return null;
  }

  const monthWord = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

  // 15 October 2026, 15 Oct
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:\\s*-\\s*\\d{1,2})?\\s+${monthWord}\\b(?:\\s+(\\d{4}))?`));
  if (m) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    return m[3] ? valid(Number(m[3]), month, day) : withInferredYear(month, day, ctx.reference);
  }

  // October 15, 2026; Oct 15
  m = s.match(new RegExp(`\\b${monthWord}\\s+(\\d{1,2})\\b(?:\\s*-\\s*\\d{1,2})?(?:\\s+(\\d{4}))?`));
  if (m) {
    const month = MONTHS[m[1]];
    const day = Number(m[2]);
    return m[3] ? valid(Number(m[3]), month, day) : withInferredYear(month, day, ctx.reference);
  }

  // Week 6 — the Friday of that week, counted from term start.
  m = s.match(/\b(?:week|wk)\s*(\d{1,2})\b/);
  if (m && ctx.termStart) {
    const week = Number(m[1]);
    if (week >= 1 && week <= 30) return addDays(utcDay(ctx.termStart), (week - 1) * 7 + 4);
  }

  return null;
}
