"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { onboardingAction, type CreateCourseState } from "@/app/(app)/dashboard/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Three steps: name the course → when is the exam and how much time a day →
 * upload (on the course page). Steps 1 and 2 are one form so nothing is
 * created until the student commits.
 */
export function OnboardingWizard() {
  const [state, action, pending] = useActionState<CreateCourseState, FormData>(onboardingAction, {});
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="flex flex-col gap-5">
      <ol className="flex gap-2 text-xs font-medium" aria-label="Steps">
        {["Course", "Exam and time", "Syllabus"].map((label, i) => (
          <li
            key={label}
            aria-current={i + 1 === step ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${i + 1 === step ? "border-ink text-ink" : i + 1 < step ? "border-line text-success" : "border-line text-ink-3"}`}
          >
            <span>{i + 1 < step ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
        <Field label="Which course worries you most?" htmlFor="onboarding-title" hint="You can add the rest later.">
          <Input
            id="onboarding-title"
            name="title"
            placeholder="e.g. Linear Algebra"
            required
            minLength={2}
            maxLength={120}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Button type="button" disabled={title.trim().length < 2} onClick={() => setStep(2)} className="w-full sm:w-fit">
          Next
        </Button>
      </div>

      <div className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam date" htmlFor="onboarding-exam" hint="Optional — dates in the syllabus are used too.">
            <Input id="onboarding-exam" name="examDate" type="date" min={today} />
          </Field>
          <Field label="Study time per day" htmlFor="onboarding-minutes" hint="Minutes. You can change it later.">
            <Input
              id="onboarding-minutes"
              name="minutesPerDay"
              type="number"
              inputMode="numeric"
              min={15}
              max={480}
              step={5}
              defaultValue={60}
              required
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Next: upload the syllabus"}
          </Button>
        </div>
      </div>

      {state.error ? (
        <Alert tone={state.limitHit ? "info" : "error"}>
          {state.error}{" "}
          {state.limitHit ? (
            <Link href="/pricing" className="font-medium underline underline-offset-4">
              See Pro
            </Link>
          ) : null}
        </Alert>
      ) : null}
    </form>
  );
}
