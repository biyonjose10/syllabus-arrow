"use server";

import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import { INGEST_ERRORS, INGEST_STEPS } from "@/lib/ingest/steps";
import { DOCUMENT_UPLOADED, inngest } from "@/lib/inngest";
import { FeatureLockedError, LimitExceededError, PLANS } from "@/lib/plans";
import { rebuildSchedule } from "@/lib/schedule/rebuild";
import { requireWorkspace } from "@/lib/session";
import {
  createDocumentWithJob,
  DemoReadOnlyError,
  failJob,
  NotFoundError,
  updateCourseSettings,
  uploadPrefix,
} from "@/lib/tenancy";

export type RegisterUploadResult = { ok: true; jobId: string } | { ok: false; error: string; limitHit?: boolean };

/**
 * Called by the browser once its direct-to-Blob upload finishes. Nothing the
 * browser says about the file is trusted: the size and type are re-read from
 * storage, the pathname must sit inside this workspace's prefix, and the plan
 * limit is checked again inside the same call that creates the row.
 */
export async function registerUploadAction(input: {
  courseId: string;
  pathname: string;
  filename: string;
  kind: "SYLLABUS" | "PAST_PAPER";
}): Promise<RegisterUploadResult> {
  const { ctx } = await requireWorkspace(`/courses/${input.courseId}`);

  if (!input.pathname.startsWith(uploadPrefix(ctx, input.courseId))) {
    return { ok: false, error: "That upload doesn't belong to this course." };
  }

  const blob = await head(input.pathname).catch(() => null);
  if (!blob) return { ok: false, error: INGEST_ERRORS.MISSING_FILE.hint };
  if (blob.contentType !== "application/pdf") {
    await del(input.pathname).catch(() => undefined);
    return { ok: false, error: INGEST_ERRORS.WRONG_FORMAT.hint };
  }

  let jobId: string;
  try {
    ({ jobId } = await createDocumentWithJob(ctx, {
      courseId: input.courseId,
      kind: input.kind,
      filename: input.filename.slice(0, 200) || "syllabus.pdf",
      blobPathname: input.pathname,
      mimeType: blob.contentType,
      sizeBytes: blob.size,
      stepCount: INGEST_STEPS.length,
    }));
  } catch (error) {
    await del(input.pathname).catch(() => undefined);
    if (error instanceof LimitExceededError) {
      return {
        ok: false,
        error: `The ${PLANS[error.plan].name} plan includes ${error.max} documents. Pro removes the limit.`,
        limitHit: true,
      };
    }
    if (error instanceof FeatureLockedError) return { ok: false, error: "Past papers are part of Pro.", limitHit: true };
    if (error instanceof NotFoundError || error instanceof DemoReadOnlyError) return { ok: false, error: error.message };
    throw error;
  }

  try {
    await inngest.send({ name: DOCUMENT_UPLOADED, data: { jobId, workspaceId: ctx.workspaceId } });
  } catch (error) {
    console.error("[ingest] could not enqueue", error);
    await failJob(ctx, jobId, "WORKER_UNAVAILABLE", INGEST_ERRORS.WORKER_UNAVAILABLE.title);
  }

  revalidatePath(`/courses/${input.courseId}`);
  revalidatePath("/dashboard");
  return { ok: true, jobId };
}

export type PlanSettingsState = { error?: string; ok?: boolean };

/** Exam date + daily minutes → the schedule is rebuilt in code, instantly, for free. */
export async function updatePlanSettingsAction(
  _previous: PlanSettingsState,
  formData: FormData,
): Promise<PlanSettingsState> {
  const courseId = String(formData.get("courseId") ?? "");
  const examRaw = String(formData.get("examDate") ?? "").trim();
  const minutes = Number(formData.get("minutesPerDay"));

  let examDate: Date | null = null;
  if (examRaw) {
    const m = examRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    examDate = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!examDate || Number.isNaN(examDate.getTime())) return { error: "Pick the exam date from the calendar." };
  }
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) {
    return { error: "Daily study time must be between 15 and 480 minutes." };
  }

  const { ctx } = await requireWorkspace(`/courses/${courseId}`);
  try {
    const updated = await updateCourseSettings(ctx, courseId, { examDate, minutesPerDay: minutes });
    if (!updated) return { error: "That course doesn't exist." };
    await rebuildSchedule(ctx, courseId);
  } catch (error) {
    if (error instanceof DemoReadOnlyError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/courses/${courseId}`, "layout");
  return { ok: true };
}
