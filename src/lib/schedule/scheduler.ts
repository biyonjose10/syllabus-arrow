import type { Edge } from "../graph/algorithms";
import { addDays, daysBetween, utcDay } from "./dates";

/**
 * The study scheduler. Pure code: no model, no database, no clock of its own.
 *
 * It answers one question — "what do I study on which day?" — under two hard
 * rules and one soft one:
 *
 *   1. PREREQUISITES FIRST. A concept is never scheduled before anything it
 *      depends on. This is what the graph is for.
 *   2. WORK BACK FROM DEADLINES. A concept's deadline is its own earliest
 *      assessment, tightened by the deadline of everything downstream of it:
 *      if eigenvectors are on the October quiz, their prerequisites are due
 *      before October too, whatever the final exam date says.
 *   3. SPACED REVIEW (soft). Each concept is reviewed at least 1, 3 and 7 days
 *      after it is learned, in time left over once learning is placed, and
 *      only before the final deadline.
 *
 * When the time available cannot fit the work, it does not pretend: every
 * concept still gets a slot, in a valid order, and the slots that land on or
 * after their deadline are reported with how many days late they are.
 */

export const REVIEW_OFFSETS = [1, 3, 7] as const;
export const REVIEW_MINUTES = 15;
export const MIN_LEARN_MINUTES = 20;
export const MAX_LEARN_MINUTES = 60;

export type ScheduleInput = {
  /** Concept ids, in the order the syllabus lists them. Breaks ties. */
  conceptIds: readonly string[];
  /** Must be acyclic — validateExtraction guarantees it. */
  edges: readonly Edge[];
  assessments: readonly { dueDate: Date | null; conceptIds: readonly string[] }[];
  /** Set by the student. Covers every concept with no earlier deadline. */
  examDate: Date | null;
  /** The first day that can be scheduled — normally today. */
  start: Date;
  minutesPerDay: number;
  /** Share of past-paper marks per concept. Breaks ties between equal deadlines. */
  examWeight?: ReadonlyMap<string, number>;
};

export type PlannedItem = {
  conceptId: string;
  date: Date;
  kind: "LEARN" | "REVIEW";
  minutes: number;
  /** Order within the whole plan; sorts items that share a day. */
  seq: number;
  /** The day this concept must be learned before. */
  deadline: Date;
  /** LEARN items only: days on or past the deadline. 0 when on time. */
  lateByDays: number;
};

export type ScheduleResult =
  | { status: "NO_DATES"; items: [] }
  | {
      status: "OK";
      items: PlannedItem[];
      learnMinutes: number;
      finalDeadline: Date;
      lateConcepts: number;
    };

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const start = utcDay(input.start);
  const ids = input.conceptIds;
  const known = new Set(ids);
  const edges = input.edges.filter((e) => known.has(e.from) && known.has(e.to));
  const minutesPerDay = Math.max(MIN_LEARN_MINUTES, Math.round(input.minutesPerDay));

  // ── deadlines ─────────────────────────────────────────────────────────────
  // Only future dates count: an assessment that has already happened cannot
  // be studied for, and must not drag the whole plan into the past.
  const future = (d: Date | null): d is Date => d !== null && utcDay(d) > start;
  const own = new Map<string, Date>();
  const earlier = (a: Date | undefined, b: Date) => (a && a <= b ? a : b);

  let latestAssessment: Date | null = null;
  for (const a of input.assessments) {
    if (!future(a.dueDate)) continue;
    const due = utcDay(a.dueDate);
    if (!latestAssessment || due > latestAssessment) latestAssessment = due;
    for (const id of a.conceptIds) if (known.has(id)) own.set(id, earlier(own.get(id), due));
  }

  const exam = future(input.examDate) ? utcDay(input.examDate) : null;
  const fallback = exam ?? latestAssessment;
  if (!fallback || ids.length === 0) return { status: "NO_DATES", items: [] };

  const deadline = new Map<string, Date>();
  for (const id of ids) {
    let d = own.get(id) ?? fallback;
    if (exam && d > exam) d = exam;
    deadline.set(id, d);
  }

  // Tighten backwards: a prerequisite is due no later than anything that needs it.
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const parentCount = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    children.get(e.from)!.push(e.to);
    parentCount.set(e.to, parentCount.get(e.to)! + 1);
  }
  const reverseTopo = priorityTopo(ids, children, parentCount, () => 0).reverse();
  for (const id of reverseTopo) {
    for (const child of children.get(id)!) {
      deadline.set(id, earlier(deadline.get(id), deadline.get(child)!));
    }
  }

  // ── order: prerequisites first, then earliest deadline, then exam weight,
  // then syllabus order. Deadlines are whole days (86.4M ms apart), so subtracting
  // a weight in [0, 1] only reorders topics that share a deadline.
  const weight = (id: string) => Math.min(1, Math.max(0, input.examWeight?.get(id) ?? 0));
  const order = priorityTopo(ids, children, parentCount, (id) => deadline.get(id)!.getTime() - weight(id));

  // ── time budget ───────────────────────────────────────────────────────────
  let finalDeadline = start;
  for (const d of deadline.values()) if (d > finalDeadline) finalDeadline = d;
  const days = Math.max(1, daysBetween(start, finalDeadline));
  const reviewBudget = ids.length * REVIEW_OFFSETS.length * REVIEW_MINUTES;

  // When there is slack, a quarter of each day is held back for review so
  // learning does not fill every minute. When there is not, learning gets it all.
  const roomy = days * minutesPerDay >= ids.length * MIN_LEARN_MINUTES + reviewBudget;
  const reserve = roomy ? Math.round(minutesPerDay * 0.25) : 0;
  const perConcept = Math.floor((days * minutesPerDay - reviewBudget) / ids.length);
  const learnMinutes = Math.min(
    Math.max(MIN_LEARN_MINUTES, minutesPerDay - reserve),
    MAX_LEARN_MINUTES,
    Math.max(MIN_LEARN_MINUTES, perConcept),
  );
  const learnCapacity = Math.max(minutesPerDay - reserve, learnMinutes);

  const used = new Map<number, number>();
  const load = (day: number) => used.get(day) ?? 0;
  const items: PlannedItem[] = [];
  let seq = 0;
  let lateConcepts = 0;

  // ── pass 1: learning — hard constraints, packed as early as allowed ───────
  // Earliest-deadline order inside a topological sort, placed day by day,
  // is what keeps an early quiz's prerequisites on time.
  const learned: { id: string; day: number }[] = [];
  let cursor = 0;
  for (const id of order) {
    let day = cursor;
    while (load(day) + learnMinutes > learnCapacity) day++;
    cursor = day;
    used.set(day, load(day) + learnMinutes);
    learned.push({ id, day });

    const due = deadline.get(id)!;
    const lastOnTimeDay = daysBetween(start, due) - 1;
    const lateByDays = Math.max(0, day - lastOnTimeDay);
    if (lateByDays > 0) lateConcepts++;

    items.push({
      conceptId: id,
      date: addDays(start, day),
      kind: "LEARN",
      minutes: learnMinutes,
      seq: seq++,
      deadline: due,
      lateByDays,
    });
  }

  // ── pass 2: review — soft, into whatever time is left ─────────────────────
  // A review lands at least `offset` days after learning, on the first day
  // with room, and never on or after the final deadline. No room → skipped,
  // never squeezed in over the student's daily minutes.
  for (const { id, day } of learned) {
    let previous = day;
    for (const offset of REVIEW_OFFSETS) {
      let reviewDay = Math.max(day + offset, previous + 1);
      while (reviewDay < days && load(reviewDay) + REVIEW_MINUTES > minutesPerDay) reviewDay++;
      if (reviewDay >= days) break;
      used.set(reviewDay, load(reviewDay) + REVIEW_MINUTES);
      previous = reviewDay;
      items.push({
        conceptId: id,
        date: addDays(start, reviewDay),
        kind: "REVIEW",
        minutes: REVIEW_MINUTES,
        seq: seq++,
        deadline: deadline.get(id)!,
        lateByDays: 0,
      });
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.seq - b.seq);
  return { status: "OK", items, learnMinutes, finalDeadline, lateConcepts };
}

/**
 * Kahn's algorithm with a priority: among concepts whose prerequisites are all
 * placed, take the lowest `rank`, then the earliest in syllabus order.
 */
function priorityTopo(
  ids: readonly string[],
  children: Map<string, string[]>,
  parentCount: Map<string, number>,
  rank: (id: string) => number,
): string[] {
  const position = new Map(ids.map((id, i) => [id, i]));
  const remaining = new Map(parentCount);
  const ready = ids.filter((id) => remaining.get(id) === 0);
  const order: string[] = [];

  while (ready.length) {
    ready.sort((a, b) => rank(a) - rank(b) || position.get(a)! - position.get(b)!);
    const id = ready.shift()!;
    order.push(id);
    for (const child of children.get(id)!) {
      remaining.set(child, remaining.get(child)! - 1);
      if (remaining.get(child) === 0) ready.push(child);
    }
  }

  if (order.length !== ids.length) throw new Error("Schedule input has a cycle; validate the graph first.");
  return order;
}
