import { prismaUnsafe as db } from "./db";
import { DEMO_ASSESSMENTS, DEMO_EXAM_IN_DAYS } from "./demo";
import { BKT, bktReplay, bktUpdate } from "./mastery/bkt";
import { addDays, utcDay } from "./schedule/dates";
import { assertFeature, assertWithinLimit, type PlanId } from "./plans";

/**
 * The tenancy boundary.
 *
 * This is the only module (besides Better Auth's adapter) allowed to touch the
 * Prisma client, and every function here takes a `WorkspaceContext` first. A
 * context can only be minted by `ensurePersonalWorkspace`, from a user id the
 * session layer has already authenticated — so there is no way to call a data
 * function without saying whose data it is.
 *
 * A record in another workspace is indistinguishable from one that does not
 * exist: reads return `null` and pages turn that into a 404, never a 403,
 * which would confirm the id is real.
 */

declare const brand: unique symbol;

export type WorkspaceContext = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly plan: PlanId;
  readonly isDemo: boolean;
  readonly [brand]: true;
};

export class DemoReadOnlyError extends Error {
  constructor() {
    super("The demo course is view-only. Create a free account to plan your own.");
    this.name = "DemoReadOnlyError";
  }
}

function toContext(
  userId: string,
  workspace: { id: string; plan: "FREE" | "PRO"; isDemo: boolean },
): WorkspaceContext {
  return {
    workspaceId: workspace.id,
    userId,
    plan: workspace.plan === "PRO" ? "pro" : "free",
    isDemo: workspace.isDemo,
  } as WorkspaceContext;
}

function assertWritable(ctx: WorkspaceContext): void {
  if (ctx.isDemo) throw new DemoReadOnlyError();
}

/**
 * Called from Better Auth's user-create hook, and again on every request as a
 * self-heal: if the hook ever failed mid-signup, the student still lands in a
 * working workspace instead of an error page.
 */
export async function ensurePersonalWorkspace(
  userId: string,
  displayName: string,
): Promise<WorkspaceContext> {
  const existing = await db.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspace: { select: { id: true, plan: true, isDemo: true } } },
  });
  if (existing) return toContext(userId, existing.workspace);

  const first = displayName.trim().split(/\s+/)[0];
  const workspace = await db.workspace.create({
    data: {
      name: first ? `${first}'s workspace` : "My workspace",
      memberships: { create: { userId, role: "OWNER" } },
    },
    select: { id: true, plan: true, isDemo: true },
  });
  return toContext(userId, workspace);
}

export async function getWorkspace(ctx: WorkspaceContext) {
  return db.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { name: true, plan: true, isDemo: true },
  });
}

// ── Courses ─────────────────────────────────────────────────────────────────

export async function listCourses(ctx: WorkspaceContext) {
  return db.course.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      examDate: true,
      createdAt: true,
      _count: { select: { documents: true, concepts: true } },
    },
  });
}

export async function getCourse(ctx: WorkspaceContext, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
  });
}

export async function createCourse(ctx: WorkspaceContext, title: string) {
  assertWritable(ctx);
  const used = await db.course.count({ where: { workspaceId: ctx.workspaceId } });
  assertWithinLimit(ctx.plan, "courses", used);
  return db.course.create({
    data: { workspaceId: ctx.workspaceId, title: title.trim() },
    select: { id: true },
  });
}

export async function updateCourseSettings(
  ctx: WorkspaceContext,
  courseId: string,
  settings: { examDate: Date | null; minutesPerDay: number },
): Promise<boolean> {
  assertWritable(ctx);
  const { count } = await db.course.updateMany({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    data: settings,
  });
  return count === 1;
}

/** Everything the course page needs in one read. `null` → 404. */
export async function getCourseOverview(ctx: WorkspaceContext, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      title: true,
      status: true,
      examDate: true,
      minutesPerDay: true,
      termStart: true,
      planStatus: true,
      plannedAt: true,
      lateConcepts: true,
      _count: { select: { concepts: true, edges: true, documents: true } },
      assessments: {
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
        select: { id: true, title: true, dueDateRaw: true, dueDate: true, weight: true },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, kind: true, sizeBytes: true, createdAt: true },
      },
    },
  });
}

// ── Uploads and ingest jobs ─────────────────────────────────────────────────

export class NotFoundError extends Error {
  constructor(what = "That course") {
    super(`${what} doesn't exist.`);
    this.name = "NotFoundError";
  }
}

/**
 * Every blob a workspace owns lives under this prefix. The upload token is
 * only issued for a pathname inside it, and registration re-checks it, so a
 * student cannot attach someone else's file to their course.
 */
export function uploadPrefix(ctx: WorkspaceContext, courseId: string): string {
  return `workspaces/${ctx.workspaceId}/courses/${courseId}/`;
}

type DocumentKindInput = "SYLLABUS" | "PAST_PAPER";

/** Checked before the upload token is issued — never after the bytes arrive. */
export async function assertCanUpload(ctx: WorkspaceContext, courseId: string, kind: DocumentKindInput) {
  assertWritable(ctx);
  const course = await getCourse(ctx, courseId);
  if (!course) throw new NotFoundError();
  if (kind === "PAST_PAPER") assertFeature(ctx.plan, "pastPapers");
  const used = await db.document.count({ where: { workspaceId: ctx.workspaceId } });
  assertWithinLimit(ctx.plan, "documents", used);
}

export async function createDocumentWithJob(
  ctx: WorkspaceContext,
  input: {
    courseId: string;
    kind: DocumentKindInput;
    filename: string;
    blobPathname: string;
    mimeType: string;
    sizeBytes: number;
    stepCount: number;
  },
) {
  if (!input.blobPathname.startsWith(uploadPrefix(ctx, input.courseId))) throw new NotFoundError("That file");
  await assertCanUpload(ctx, input.courseId, input.kind);

  return db.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        workspaceId: ctx.workspaceId,
        courseId: input.courseId,
        kind: input.kind,
        filename: input.filename,
        blobPathname: input.blobPathname,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
      select: { id: true },
    });
    const job = await tx.ingestJob.create({
      data: { workspaceId: ctx.workspaceId, documentId: document.id, stepCount: input.stepCount },
      select: { id: true },
    });
    await tx.course.updateMany({
      where: { id: input.courseId, workspaceId: ctx.workspaceId },
      data: { status: "PROCESSING" },
    });
    return { documentId: document.id, jobId: job.id };
  });
}

/**
 * The background job's way in. An Inngest event carries only a job id; the
 * workspace is read from that job's own row, so the job can only ever touch
 * the workspace that created it. Events are signed by Inngest, and the id is a
 * cuid no client ever chose.
 */
export async function contextForJob(jobId: string) {
  const job = await db.ingestJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      workspace: {
        select: {
          id: true,
          plan: true,
          isDemo: true,
          memberships: { where: { role: "OWNER" }, take: 1, select: { userId: true } },
        },
      },
      document: {
        select: { id: true, courseId: true, kind: true, blobPathname: true, filename: true, sizeBytes: true },
      },
    },
  });
  if (!job) return null;
  const ownerId = job.workspace.memberships[0]?.userId ?? "";
  const { id: documentId, ...document } = job.document;
  return {
    ctx: toContext(ownerId, job.workspace),
    job: { id: job.id, status: job.status, documentId, ...document },
  };
}

export async function startJobStep(ctx: WorkspaceContext, jobId: string, stepIndex: number, step: string) {
  await db.ingestJob.updateMany({
    where: { id: jobId, workspaceId: ctx.workspaceId },
    data: { status: "RUNNING", stepIndex, step, ...(stepIndex === 1 ? { startedAt: new Date() } : {}) },
  });
}

export async function setDocumentHash(ctx: WorkspaceContext, documentId: string, sha256: string) {
  await db.document.updateMany({ where: { id: documentId, workspaceId: ctx.workspaceId }, data: { sha256 } });
}

export async function recordJobResult(
  ctx: WorkspaceContext,
  jobId: string,
  result: { model?: string; report?: Record<string, number> },
) {
  await db.ingestJob.updateMany({
    where: { id: jobId, workspaceId: ctx.workspaceId },
    data: { ...(result.model ? { model: result.model } : {}), ...(result.report ? { report: result.report } : {}) },
  });
}

export async function succeedJob(ctx: WorkspaceContext, jobId: string, courseId: string) {
  await db.$transaction([
    db.ingestJob.updateMany({
      where: { id: jobId, workspaceId: ctx.workspaceId },
      data: { status: "SUCCEEDED", step: null, errorCode: null, errorMessage: null, finishedAt: new Date() },
    }),
    db.course.updateMany({ where: { id: courseId, workspaceId: ctx.workspaceId }, data: { status: "READY" } }),
  ]);
}

/**
 * A failed read never destroys a working plan: a course that already has a
 * map goes back to READY, and only a course with nothing to show is FAILED.
 */
export async function failJob(ctx: WorkspaceContext, jobId: string, code: string, message: string) {
  const job = await db.ingestJob.findFirst({
    where: { id: jobId, workspaceId: ctx.workspaceId },
    select: { document: { select: { courseId: true } } },
  });
  if (!job) return;
  const courseId = job.document.courseId;
  const concepts = await db.concept.count({ where: { courseId, workspaceId: ctx.workspaceId } });
  await db.$transaction([
    db.ingestJob.updateMany({
      where: { id: jobId, workspaceId: ctx.workspaceId },
      data: { status: "FAILED", errorCode: code, errorMessage: message.slice(0, 500), finishedAt: new Date() },
    }),
    db.course.updateMany({
      where: { id: courseId, workspaceId: ctx.workspaceId },
      data: { status: concepts > 0 ? "READY" : "FAILED" },
    }),
  ]);
}

/** The processing screen's poll. `null` → 404. */
export async function getCourseStatus(ctx: WorkspaceContext, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: { status: true },
  });
  if (!course) return null;
  const job = await db.ingestJob.findFirst({
    where: { workspaceId: ctx.workspaceId, document: { courseId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      step: true,
      stepIndex: true,
      stepCount: true,
      errorCode: true,
      errorMessage: true,
      model: true,
      report: true,
      createdAt: true,
      finishedAt: true,
      document: { select: { filename: true, kind: true } },
    },
  });
  return { status: course.status, job };
}

// ── The graph ───────────────────────────────────────────────────────────────

export type GraphToPersist = {
  termStart: Date | null;
  concepts: { slug: string; name: string; summary: string; sourceRef: string }[];
  edges: { from: string; to: string; rationale: string }[];
  assessments: { title: string; dueDateRaw: string | null; dueDate: Date | null; weight: number | null; conceptSlugs: string[] }[];
};

/**
 * Replaces a course's map in one transaction: a student never sees half an
 * old graph and half a new one. Re-uploading a syllabus replaces the map (and,
 * through the cascade, the schedule built on it).
 */
export async function persistGraph(ctx: WorkspaceContext, courseId: string, graph: GraphToPersist) {
  assertWritable(ctx);
  const where = { courseId, workspaceId: ctx.workspaceId };

  await db.$transaction(
    async (tx) => {
      const course = await tx.course.findFirst({ where: { id: courseId, workspaceId: ctx.workspaceId }, select: { id: true } });
      if (!course) throw new NotFoundError();

      await tx.concept.deleteMany({ where });
      await tx.assessment.deleteMany({ where });
      await tx.course.update({ where: { id: courseId }, data: { termStart: graph.termStart } });

      await tx.concept.createMany({
        data: graph.concepts.map((c, position) => ({ ...c, position, courseId, workspaceId: ctx.workspaceId })),
      });
      const rows = await tx.concept.findMany({ where, select: { id: true, slug: true } });
      const idOf = new Map(rows.map((r) => [r.slug, r.id]));

      await tx.edge.createMany({
        data: graph.edges.flatMap((e) => {
          const fromId = idOf.get(e.from);
          const toId = idOf.get(e.to);
          return fromId && toId ? [{ fromId, toId, rationale: e.rationale, courseId, workspaceId: ctx.workspaceId }] : [];
        }),
        skipDuplicates: true,
      });

      for (const a of graph.assessments) {
        const assessment = await tx.assessment.create({
          data: {
            courseId,
            workspaceId: ctx.workspaceId,
            title: a.title,
            dueDateRaw: a.dueDateRaw,
            dueDate: a.dueDate,
            weight: a.weight,
          },
          select: { id: true },
        });
        const links = a.conceptSlugs.flatMap((slug) => {
          const conceptId = idOf.get(slug);
          return conceptId ? [{ assessmentId: assessment.id, conceptId, workspaceId: ctx.workspaceId }] : [];
        });
        if (links.length) await tx.assessmentConcept.createMany({ data: links, skipDuplicates: true });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function getCourseGraph(ctx: WorkspaceContext, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: { id: true, title: true, status: true },
  });
  if (!course) return null;
  const where = { courseId, workspaceId: ctx.workspaceId };
  const [concepts, edges, assessments] = await Promise.all([
    db.concept.findMany({
      where,
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, summary: true, sourceRef: true, position: true },
    }),
    db.edge.findMany({ where, select: { id: true, fromId: true, toId: true, rationale: true } }),
    db.assessment.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      select: { id: true, title: true, dueDateRaw: true, dueDate: true, weight: true, concepts: { select: { conceptId: true } } },
    }),
  ]);
  return {
    course,
    concepts,
    edges,
    assessments: assessments.map(({ concepts: links, ...a }) => ({ ...a, conceptIds: links.map((l) => l.conceptId) })),
  };
}

// ── The schedule ────────────────────────────────────────────────────────────

export async function getScheduleInputs(ctx: WorkspaceContext, courseId: string) {
  const graph = await getCourseGraph(ctx, courseId);
  if (!graph) return null;
  const [course, examQuestions] = await Promise.all([
    db.course.findFirstOrThrow({
      where: { id: courseId, workspaceId: ctx.workspaceId },
      select: { examDate: true, minutesPerDay: true },
    }),
    db.examQuestion.findMany({ where: { courseId, workspaceId: ctx.workspaceId }, select: { conceptId: true, marks: true } }),
  ]);
  return { ...graph, examDate: course.examDate, minutesPerDay: course.minutesPerDay, examQuestions };
}

export async function replaceSchedule(
  ctx: WorkspaceContext,
  courseId: string,
  plan: {
    status: "OK" | "NO_DATES";
    lateConcepts: number;
    items: { conceptId: string; date: Date; kind: "LEARN" | "REVIEW"; minutes: number; seq: number; deadline: Date; lateByDays: number }[];
  },
  /** The demo's schedule is re-dated daily by the system, never by a visitor. */
  options: { systemRefresh?: boolean } = {},
) {
  if (!options.systemRefresh) assertWritable(ctx);
  const where = { courseId, workspaceId: ctx.workspaceId };
  await db.$transaction([
    db.scheduleItem.deleteMany({ where }),
    db.scheduleItem.createMany({ data: plan.items.map((i) => ({ ...i, courseId, workspaceId: ctx.workspaceId })) }),
    db.course.updateMany({
      where: { id: courseId, workspaceId: ctx.workspaceId },
      data: { planStatus: plan.status, plannedAt: new Date(), lateConcepts: plan.lateConcepts },
    }),
  ]);
}

export async function getSchedule(ctx: WorkspaceContext, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      title: true,
      status: true,
      examDate: true,
      minutesPerDay: true,
      planStatus: true,
      plannedAt: true,
      lateConcepts: true,
      _count: { select: { concepts: true } },
    },
  });
  if (!course) return null;
  const items = await db.scheduleItem.findMany({
    where: { courseId, workspaceId: ctx.workspaceId },
    orderBy: [{ date: "asc" }, { seq: "asc" }],
    select: {
      id: true,
      date: true,
      kind: true,
      minutes: true,
      deadline: true,
      lateByDays: true,
      concept: { select: { id: true, name: true, summary: true } },
    },
  });
  return { course, items };
}

// ── Course-level background jobs ────────────────────────────────────────────

/** Like contextForJob: the workspace comes from the course's own row. */
export async function contextForCourse(courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      workspace: {
        select: {
          id: true,
          plan: true,
          isDemo: true,
          memberships: { where: { role: "OWNER" }, take: 1, select: { userId: true } },
        },
      },
    },
  });
  if (!course) return null;
  return {
    ctx: toContext(course.workspace.memberships[0]?.userId ?? "", course.workspace),
    course: { id: course.id, title: course.title },
  };
}

export async function setChecksStatus(ctx: WorkspaceContext, courseId: string, status: "PENDING" | "READY" | "FAILED") {
  await db.course.updateMany({ where: { id: courseId, workspaceId: ctx.workspaceId }, data: { checksStatus: status } });
}

export async function saveCheckQuestions(
  ctx: WorkspaceContext,
  courseId: string,
  questions: { conceptId: string; stem: string; options: string[]; answerIndex: number; explanation: string; verified: boolean }[],
): Promise<number> {
  const concepts = await db.concept.findMany({ where: { courseId, workspaceId: ctx.workspaceId }, select: { id: true } });
  const known = new Set(concepts.map((c) => c.id));
  const rows = questions.filter((q) => known.has(q.conceptId));
  if (rows.length) {
    await db.checkQuestion.createMany({ data: rows.map((q) => ({ ...q, courseId, workspaceId: ctx.workspaceId })) });
  }
  return rows.filter((q) => q.verified).length;
}

// ── Practice and mastery ────────────────────────────────────────────────────

const dayKey = (prefix: string, now = new Date()) => `${prefix}:${now.toISOString().slice(0, 10)}`;

export async function getChecksUsedToday(ctx: WorkspaceContext): Promise<number> {
  const counter = await db.usageCounter.findUnique({
    where: { workspaceId_key: { workspaceId: ctx.workspaceId, key: dayKey("checks") } },
    select: { count: true },
  });
  return counter?.count ?? 0;
}

/** Everything the question picker needs, for the signed-in student. `null` → 404. */
export async function getPracticeState(ctx: WorkspaceContext, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: { id: true, title: true, status: true, checksStatus: true },
  });
  if (!course) return null;
  const where = { courseId, workspaceId: ctx.workspaceId };
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

  const [questions, answered, mastery, due, concepts] = await Promise.all([
    db.checkQuestion.findMany({ where: { ...where, verified: true, flaggedAt: null }, select: { id: true, conceptId: true } }),
    db.attempt.groupBy({
      by: ["questionId"],
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId, question: { courseId } },
      _count: { _all: true },
    }),
    db.masteryState.findMany({
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId, concept: { courseId } },
      select: { conceptId: true, pKnown: true, attempts: true },
    }),
    db.scheduleItem.findMany({ where: { ...where, date: { lte: today } }, select: { conceptId: true }, distinct: ["conceptId"] }),
    db.concept.findMany({ where, orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    course,
    questions,
    timesAnswered: new Map(answered.map((a) => [a.questionId, a._count._all])),
    mastery: new Map(mastery.map((m) => [m.conceptId, { pKnown: m.pKnown, attempts: m.attempts }])),
    due: new Set(due.map((d) => d.conceptId)),
    concepts,
  };
}

/** A question without its answer — what the browser is allowed to see. */
export async function getQuestionForPractice(ctx: WorkspaceContext, questionId: string) {
  return db.checkQuestion.findFirst({
    where: { id: questionId, workspaceId: ctx.workspaceId, verified: true, flaggedAt: null },
    select: { id: true, conceptId: true, stem: true, options: true, concept: { select: { name: true } } },
  });
}

/**
 * Marks an answer and updates mastery with BKT. The answer key never leaves
 * the server before this call. In the demo workspace the answer is marked
 * but nothing is written, so every judge sees the same seeded story.
 */
export async function recordAttempt(ctx: WorkspaceContext, questionId: string, chosenIndex: number) {
  const question = await db.checkQuestion.findFirst({
    where: { id: questionId, workspaceId: ctx.workspaceId, verified: true, flaggedAt: null },
    select: { id: true, conceptId: true, answerIndex: true, explanation: true, options: true, concept: { select: { name: true, courseId: true } } },
  });
  if (!question) throw new NotFoundError("That question");
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= question.options.length) {
    throw new NotFoundError("That answer");
  }

  const correct = chosenIndex === question.answerIndex;
  const existing = await db.masteryState.findUnique({
    where: { userId_conceptId: { userId: ctx.userId, conceptId: question.conceptId } },
    select: { pKnown: true, attempts: true },
  });
  const before = existing?.pKnown ?? BKT.pInit;
  const after = bktUpdate(before, correct);
  const result = {
    correct,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    conceptId: question.conceptId,
    conceptName: question.concept.name,
    courseId: question.concept.courseId,
    before,
    after,
    attempts: (existing?.attempts ?? 0) + 1,
    saved: !ctx.isDemo,
  };
  if (ctx.isDemo) return result;

  assertWithinLimit(ctx.plan, "checksPerDay", await getChecksUsedToday(ctx));
  const key = dayKey("checks");
  await db.$transaction([
    db.usageCounter.upsert({
      where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
      create: { workspaceId: ctx.workspaceId, key, count: 1 },
      update: { count: { increment: 1 } },
    }),
    db.attempt.create({ data: { workspaceId: ctx.workspaceId, userId: ctx.userId, questionId, chosenIndex, correct } }),
    db.masteryState.upsert({
      where: { userId_conceptId: { userId: ctx.userId, conceptId: question.conceptId } },
      create: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        conceptId: question.conceptId,
        pKnown: after,
        attempts: 1,
        correct: correct ? 1 : 0,
      },
      update: { pKnown: after, attempts: { increment: 1 }, correct: { increment: correct ? 1 : 0 } },
    }),
  ]);
  return result;
}

/**
 * "This question is wrong." The question stops being shown, and the student's
 * mastery for that concept is replayed from the answers that remain — so a bad
 * key cannot keep counting against them.
 */
export async function flagQuestion(ctx: WorkspaceContext, questionId: string) {
  assertWritable(ctx);
  const question = await db.checkQuestion.findFirst({
    where: { id: questionId, workspaceId: ctx.workspaceId },
    select: { id: true, conceptId: true, courseId: true },
  });
  if (!question) throw new NotFoundError("That question");

  await db.checkQuestion.update({ where: { id: question.id }, data: { flaggedAt: new Date() } });

  const answers = await db.attempt.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      question: { conceptId: question.conceptId, verified: true, flaggedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: { correct: true },
  });
  const key = { userId_conceptId: { userId: ctx.userId, conceptId: question.conceptId } };
  if (answers.length === 0) {
    await db.masteryState.deleteMany({ where: { userId: ctx.userId, conceptId: question.conceptId } });
  } else {
    const replay = {
      pKnown: bktReplay(answers.map((a) => a.correct)),
      attempts: answers.length,
      correct: answers.filter((a) => a.correct).length,
    };
    await db.masteryState.upsert({
      where: key,
      create: { workspaceId: ctx.workspaceId, userId: ctx.userId, conceptId: question.conceptId, ...replay },
      update: replay,
    });
  }
  return question.courseId;
}

/** "I've done this." The claim the insights page is allowed to contradict. */
export async function setMarkedDone(ctx: WorkspaceContext, conceptId: string, done: boolean) {
  assertWritable(ctx);
  const concept = await db.concept.findFirst({
    where: { id: conceptId, workspaceId: ctx.workspaceId },
    select: { id: true, courseId: true },
  });
  if (!concept) throw new NotFoundError("That topic");
  if (done) {
    await db.selfReport.upsert({
      where: { userId_conceptId: { userId: ctx.userId, conceptId } },
      create: { workspaceId: ctx.workspaceId, userId: ctx.userId, conceptId },
      update: {},
    });
  } else {
    await db.selfReport.deleteMany({ where: { userId: ctx.userId, conceptId, workspaceId: ctx.workspaceId } });
  }
  return concept.courseId;
}

/** Map + the student's evidence about it. Feeds the map colours and the insights. */
export async function getMasteryOverview(ctx: WorkspaceContext, courseId: string) {
  const graph = await getCourseGraph(ctx, courseId);
  if (!graph) return null;
  const scope = { workspaceId: ctx.workspaceId, userId: ctx.userId };

  const [mastery, reports, attempts, questionCounts, examQuestions] = await Promise.all([
    db.masteryState.findMany({
      where: { ...scope, concept: { courseId } },
      select: { conceptId: true, pKnown: true, attempts: true, correct: true },
    }),
    db.selfReport.findMany({ where: { ...scope, concept: { courseId } }, select: { conceptId: true } }),
    db.attempt.findMany({
      where: { ...scope, question: { courseId, verified: true, flaggedAt: null } },
      select: { correct: true, question: { select: { conceptId: true } } },
    }),
    db.checkQuestion.groupBy({
      by: ["conceptId"],
      where: { courseId, workspaceId: ctx.workspaceId, verified: true, flaggedAt: null },
      _count: { _all: true },
    }),
    db.examQuestion.findMany({
      where: { courseId, workspaceId: ctx.workspaceId },
      select: { conceptId: true, marks: true },
    }),
  ]);

  return {
    ...graph,
    mastery: new Map(mastery.map((m) => [m.conceptId, m])),
    markedDone: new Set(reports.map((r) => r.conceptId)),
    attempts: attempts.map((a) => ({ conceptId: a.question.conceptId, correct: a.correct })),
    questionCounts: new Map(questionCounts.map((q) => [q.conceptId, q._count._all])),
    examQuestions,
  };
}

// ── Past papers ─────────────────────────────────────────────────────────────

export async function persistExamQuestions(
  ctx: WorkspaceContext,
  courseId: string,
  documentId: string,
  rows: { conceptId: string; label: string; text: string; marks: number | null }[],
) {
  assertWritable(ctx);
  const concepts = await db.concept.findMany({ where: { courseId, workspaceId: ctx.workspaceId }, select: { id: true } });
  const known = new Set(concepts.map((c) => c.id));
  await db.$transaction([
    db.examQuestion.deleteMany({ where: { documentId, workspaceId: ctx.workspaceId } }),
    db.examQuestion.createMany({
      data: rows
        .filter((r) => known.has(r.conceptId))
        .map((r) => ({ ...r, courseId, documentId, workspaceId: ctx.workspaceId })),
    }),
  ]);
}

// ── Billing ─────────────────────────────────────────────────────────────────

/**
 * Called by the Polar webhook — no session, so the workspace is found from the
 * Better Auth user id Polar holds as the customer's external id. Only a live
 * subscription grants Pro; a revoked or ended one drops back to Free.
 */
export async function applySubscription(
  userId: string,
  subscription: { id: string; status: string; currentPeriodEnd: Date | null; endedAt: Date | null },
) {
  const ctx = await ensurePersonalWorkspace(userId, "");
  if (ctx.isDemo) return;
  const pro = ["active", "trialing", "past_due"].includes(subscription.status) && !subscription.endedAt;
  const data = {
    polarSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
  await db.$transaction([
    db.subscription.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: { workspaceId: ctx.workspaceId, ...data },
      update: data,
    }),
    db.workspace.update({ where: { id: ctx.workspaceId }, data: { plan: pro ? "PRO" : "FREE" } }),
  ]);
}

export async function getBilling(ctx: WorkspaceContext) {
  const [subscription, usage] = await Promise.all([
    db.subscription.findUnique({
      where: { workspaceId: ctx.workspaceId },
      select: { status: true, currentPeriodEnd: true, updatedAt: true },
    }),
    getUsage(ctx),
  ]);
  return { plan: ctx.plan, isDemo: ctx.isDemo, subscription, usage };
}

// ── Demo ────────────────────────────────────────────────────────────────────

/** The one course in the demo workspace, if it has been seeded. */
export async function findDemoCourse() {
  return db.course.findFirst({
    where: { workspace: { isDemo: true } },
    orderBy: { createdAt: "asc" },
    select: { id: true, plannedAt: true },
  });
}

/**
 * Moves the demo's illustrative dates forward to stay relative to today.
 * System-only: it acts on nothing but the demo workspace, whoever calls it.
 * Returns true when dates moved and the schedule needs rebuilding.
 */
export async function refreshDemoDates(courseId: string, now: Date = new Date()): Promise<boolean> {
  const course = await db.course.findFirst({
    where: { id: courseId, workspace: { isDemo: true } },
    select: { id: true, plannedAt: true },
  });
  if (!course) return false;
  const today = utcDay(now);
  if (course.plannedAt && utcDay(course.plannedAt).getTime() === today.getTime()) return false;

  await db.$transaction([
    db.course.update({ where: { id: course.id }, data: { examDate: addDays(today, DEMO_EXAM_IN_DAYS) } }),
    ...DEMO_ASSESSMENTS.map((a) =>
      db.assessment.updateMany({ where: { courseId: course.id, title: a.title }, data: { dueDate: addDays(today, a.inDays) } }),
    ),
  ]);
  return true;
}

// ── Usage ───────────────────────────────────────────────────────────────────

export async function getUsage(ctx: WorkspaceContext) {
  const [courses, documents, checksToday] = await Promise.all([
    db.course.count({ where: { workspaceId: ctx.workspaceId } }),
    db.document.count({ where: { workspaceId: ctx.workspaceId } }),
    getChecksUsedToday(ctx),
  ]);
  return { courses, documents, checksToday };
}
