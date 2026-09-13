"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createCourseAction, type CreateCourseState } from "@/app/(app)/dashboard/actions";
import { Alert, Button, Input } from "@/components/ui";

export function NewCourseForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, action, pending] = useActionState<CreateCourseState, FormData>(createCourseAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="title" className="sr-only">
        Course name
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="title"
          name="title"
          placeholder="e.g. Linear Algebra"
          required
          minLength={2}
          maxLength={120}
          autoFocus={autoFocus}
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Adding…" : "Add course"}
        </Button>
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
