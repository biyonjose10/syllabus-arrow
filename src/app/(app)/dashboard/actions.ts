"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LimitExceededError } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { createCourse, DemoReadOnlyError, updateCourseSettings } from "@/lib/tenancy";

export type CreateCourseState = { error?: string; limitHit?: boolean; ok?: boolean };

export async function createCourseAction(
  _previous: CreateCourseState,
  formData: FormData,
): Promise<CreateCourseState> {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) return { error: "Give the course a name, like “Linear Algebra”." };
  if (title.length > 120) return { error: "Keep the name under 120 characters." };

  const { ctx } = await requireWorkspace();
  try {
    await createCourse(ctx, title);
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return {
        error: `The Free plan includes ${error.max} course. Pro removes the limit.`,
        limitHit: true,
      };
    }
    if (error instanceof DemoReadOnlyError) return { error: error.message };
    throw error;
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Onboarding: course name → exam date + daily minutes → (on the course page)
 * upload. Creating the course with its settings means the schedule can be
 * built the moment the syllabus is read, even if the syllabus has no dates.
 */
export async function onboardingAction(_previous: CreateCourseState, formData: FormData): Promise<CreateCourseState> {
  const title = String(formData.get("title") ?? "").trim();
  const examRaw = String(formData.get("examDate") ?? "").trim();
  const minutes = Number(formData.get("minutesPerDay") ?? 60);

  if (title.length < 2) return { error: "Give the course a name, like “Linear Algebra”." };
  if (title.length > 120) return { error: "Keep the name under 120 characters." };
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) {
    return { error: "Daily study time must be between 15 and 480 minutes." };
  }
  let examDate: Date | null = null;
  if (examRaw) {
    const m = examRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    examDate = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!examDate) return { error: "Pick the exam date from the calendar." };
  }

  const { ctx } = await requireWorkspace();
  let courseId: string;
  try {
    ({ id: courseId } = await createCourse(ctx, title));
    await updateCourseSettings(ctx, courseId, { examDate, minutesPerDay: minutes });
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return { error: `The Free plan includes ${error.max} course. Pro removes the limit.`, limitHit: true };
    }
    if (error instanceof DemoReadOnlyError) return { error: error.message };
    throw error;
  }

  revalidatePath("/dashboard");
  redirect(`/courses/${courseId}?welcome=1`);
}
