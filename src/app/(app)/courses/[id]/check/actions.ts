"use server";

import { revalidatePath } from "next/cache";

import { masteryBand, type MasteryBand } from "@/lib/mastery/bkt";
import { LimitExceededError } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { DemoReadOnlyError, flagQuestion, NotFoundError, recordAttempt, setMarkedDone } from "@/lib/tenancy";

export type AnswerResult =
  | {
      ok: true;
      correct: boolean;
      answerIndex: number;
      explanation: string;
      conceptId: string;
      conceptName: string;
      before: number;
      after: number;
      band: MasteryBand;
      saved: boolean;
    }
  | { ok: false; error: string; limitHit?: boolean };

/**
 * Marks one answer. Deliberately does NOT revalidate the page: that would swap
 * in the next question while the student is still reading the explanation.
 * The card asks for the next question itself.
 */
export async function answerCheckAction(questionId: string, chosenIndex: number): Promise<AnswerResult> {
  const { ctx } = await requireWorkspace();
  try {
    const r = await recordAttempt(ctx, questionId, chosenIndex);
    return {
      ok: true,
      correct: r.correct,
      answerIndex: r.answerIndex,
      explanation: r.explanation,
      conceptId: r.conceptId,
      conceptName: r.conceptName,
      before: r.before,
      after: r.after,
      band: masteryBand(r.after, r.attempts),
      saved: r.saved,
    };
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return {
        ok: false,
        error: `The Free plan includes ${error.max} practice questions a day. Pro removes the limit.`,
        limitHit: true,
      };
    }
    if (error instanceof NotFoundError) return { ok: false, error: "That question is no longer available." };
    throw error;
  }
}

export async function flagQuestionAction(questionId: string): Promise<{ ok: boolean; error?: string }> {
  const { ctx } = await requireWorkspace();
  try {
    const courseId = await flagQuestion(ctx, questionId);
    revalidatePath(`/courses/${courseId}`, "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof DemoReadOnlyError || error instanceof NotFoundError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function markDoneAction(conceptId: string, done: boolean): Promise<{ ok: boolean; error?: string }> {
  const { ctx } = await requireWorkspace();
  try {
    const courseId = await setMarkedDone(ctx, conceptId, done);
    revalidatePath(`/courses/${courseId}`, "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof DemoReadOnlyError || error instanceof NotFoundError) return { ok: false, error: error.message };
    throw error;
  }
}
