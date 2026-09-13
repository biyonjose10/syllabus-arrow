import type { Metadata } from "next";
import Link from "next/link";

import { NewCourseForm } from "@/components/NewCourseForm";
import { Card } from "@/components/ui";
import { UsageMeter } from "@/components/UsageMeter";
import { PLANS } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { getUsage, listCourses } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Your courses — Syllabus→" };

const STATUS_LABEL = {
  EMPTY: "Waiting for a syllabus",
  PROCESSING: "Reading documents…",
  READY: "Plan ready",
  FAILED: "Couldn't read the syllabus",
} as const;

export default async function DashboardPage() {
  const { ctx, user } = await requireWorkspace();
  const [courses, usage] = await Promise.all([listCourses(ctx), getUsage(ctx)]);
  const limits = PLANS[ctx.plan].limits;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {courses.length === 0 && firstName ? `Welcome, ${firstName}` : "Your courses"}
        </h1>
        <p className="text-sm text-ink-2">
          {courses.length === 0
            ? "Start with the course whose exam worries you most."
            : `${courses.length} ${courses.length === 1 ? "course" : "courses"} in this workspace.`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {courses.length === 0 ? (
            <Card className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">No courses yet</h2>
                <p className="max-w-prose text-sm leading-relaxed text-ink-2">
                  Name a course, then upload its syllabus PDF. You&apos;ll get the map of which topics depend on which,
                  and a schedule that works back from your exam date.
                </p>
              </div>
              <NewCourseForm autoFocus />
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${course.id}`}
                      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <Card className="flex flex-col gap-1 p-5 transition-colors hover:border-ink-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <h2 className="truncate font-semibold">{course.title}</h2>
                          <span className="shrink-0 text-xs text-ink-3">{STATUS_LABEL[course.status]}</span>
                        </div>
                        <p className="text-sm text-ink-3">
                          {course._count.documents} documents · {course._count.concepts} concepts
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-medium text-ink-2">Add another course</h2>
                <NewCourseForm />
              </Card>
            </>
          )}
        </div>

        <Card className="flex h-fit flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold">{PLANS[ctx.plan].name} plan</h2>
          <UsageMeter label="Courses" used={usage.courses} max={limits.courses} />
          <UsageMeter label="Documents" used={usage.documents} max={limits.documents} />
        </Card>
      </div>
    </div>
  );
}
