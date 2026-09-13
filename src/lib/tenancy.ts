import { prismaUnsafe as db } from "./db";
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
      document: { select: { filename: true } },
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
  const course = await db.course.findFirstOrThrow({
    where: { id: courseId, workspaceId: ctx.workspaceId },
    select: { examDate: true, minutesPerDay: true },
  });
  return { ...graph, examDate: course.examDate, minutesPerDay: course.minutesPerDay };
}

export async function replaceSchedule(
  ctx: WorkspaceContext,
  courseId: string,
  plan: {
    status: "OK" | "NO_DATES";
    lateConcepts: number;
    items: { conceptId: string; date: Date; kind: "LEARN" | "REVIEW"; minutes: number; seq: number; deadline: Date; lateByDays: number }[];
  },
) {
  assertWritable(ctx);
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

// ── Usage ───────────────────────────────────────────────────────────────────

export async function getUsage(ctx: WorkspaceContext) {
  const [courses, documents] = await Promise.all([
    db.course.count({ where: { workspaceId: ctx.workspaceId } }),
    db.document.count({ where: { workspaceId: ctx.workspaceId } }),
  ]);
  return { courses, documents };
}
