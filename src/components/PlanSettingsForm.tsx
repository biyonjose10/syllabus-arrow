"use client";

import { useActionState } from "react";

import { updatePlanSettingsAction, type PlanSettingsState } from "@/app/(app)/courses/[id]/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function PlanSettingsForm({
  courseId,
  examDate,
  minutesPerDay,
  submitLabel = "Update plan",
  stacked = false,
}: {
  courseId: string;
  /** "YYYY-MM-DD" or "". */
  examDate: string;
  minutesPerDay: number;
  submitLabel?: string;
  /** One column — for narrow side panels, where a date input would be clipped. */
  stacked?: boolean;
}) {
  const [state, action, pending] = useActionState<PlanSettingsState, FormData>(updatePlanSettingsAction, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <div className={stacked ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <Field label="Exam date" htmlFor={`exam-${courseId}`} hint="Covers every topic without an earlier deadline.">
          <Input id={`exam-${courseId}`} name="examDate" type="date" min={today} defaultValue={examDate} />
        </Field>
        <Field label="Study time per day" htmlFor={`minutes-${courseId}`} hint="Minutes. Reviews are planned inside it.">
          <Input
            id={`minutes-${courseId}`}
            name="minutesPerDay"
            type="number"
            inputMode="numeric"
            min={15}
            max={480}
            step={5}
            defaultValue={minutesPerDay}
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Planning…" : submitLabel}
        </Button>
        {state.ok && !pending ? <span className="text-sm text-success">Plan rebuilt.</span> : null}
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
