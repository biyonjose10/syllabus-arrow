import { prismaUnsafe as db } from "./db";
import { assertWithinLimit, type PlanId } from "./plans";

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

// ── Usage ───────────────────────────────────────────────────────────────────

export async function getUsage(ctx: WorkspaceContext) {
  const [courses, documents] = await Promise.all([
    db.course.count({ where: { workspaceId: ctx.workspaceId } }),
    db.document.count({ where: { workspaceId: ctx.workspaceId } }),
  ]);
  return { courses, documents };
}
