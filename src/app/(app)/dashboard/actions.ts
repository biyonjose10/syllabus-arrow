"use server";

import { revalidatePath } from "next/cache";

import { LimitExceededError } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { createCourse, DemoReadOnlyError } from "@/lib/tenancy";

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
