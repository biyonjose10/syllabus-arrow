import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlanSettingsForm } from "@/components/PlanSettingsForm";
import { Alert, buttonClass, Card } from "@/components/ui";
import { formatDay, formatMinutes, formatWeekday, toDateInput } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";
import { getSchedule } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Schedule — Syllabus→" };

export default async function SchedulePage({ params }: PageProps<"/courses/[id]/schedule">) {
  const { id } = await params;
  const { ctx } = await requireWorkspace(`/courses/${id}/schedule`);
  const data = await getSchedule(ctx, id);
  if (!data) notFound();
  const { course, items } = data;

  if (course._count.concepts === 0) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-lg font-semibold">No schedule yet</h2>
        <p className="text-sm text-ink-2">Upload the syllabus first — the schedule is built from its map.</p>
        <Link href={`/courses/${id}`} className={buttonClass("primary")}>
          Upload a syllabus
        </Link>
      </Card>
    );
  }

  const settings = (
    <PlanSettingsForm
      courseId={course.id}
      examDate={toDateInput(course.examDate)}
      minutesPerDay={course.minutesPerDay}
      submitLabel={items.length ? "Re-plan" : "Build my schedule"}
    />
  );

  if (course.planStatus !== "OK" || items.length === 0) {
    return (
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">No dates to plan against</h2>
          <p className="max-w-prose text-sm leading-relaxed text-ink-2">
            The syllabus has no exam or assignment dates that are still ahead of you. Syllabus→ won&apos;t invent one —
            set your exam date and the schedule is built backwards from it, prerequisites first.
          </p>
        </div>
        {settings}
      </Card>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.date.toISOString().slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  const totalMinutes = items.reduce((sum, i) => sum + i.minutes, 0);
  const learnCount = items.filter((i) => i.kind === "LEARN").length;
  const lastDay = [...days.keys()].at(-1)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        {course.lateConcepts > 0 ? (
          <Alert tone="error">
            {course.lateConcepts} topic{course.lateConcepts === 1 ? "" : "s"} can&apos;t be learned before{" "}
            {course.lateConcepts === 1 ? "its" : "their"} deadline at {course.minutesPerDay} minutes a day — they&apos;re marked
            below. More daily time moves them earlier.
          </Alert>
        ) : null}

        <ol className="flex flex-col gap-3">
          {[...days.entries()].map(([key, dayItems]) => {
            const isToday = key === today;
            const past = key < today;
            return (
              <li key={key}>
                <Card className={`flex flex-col gap-3 p-4 ${isToday ? "border-accent" : ""} ${past ? "opacity-60" : ""}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-semibold">
                      {isToday ? "Today" : formatWeekday(key)}
                      {isToday ? <span className="font-normal text-ink-3"> · {formatWeekday(key)}</span> : null}
                    </h2>
                    <span className="text-xs text-ink-3">{formatMinutes(dayItems.reduce((s, i) => s + i.minutes, 0))}</span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {dayItems.map((item) => (
                      <li key={item.id} className="flex items-start gap-3 text-sm">
                        <span
                          className={[
                            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                            item.kind === "LEARN" ? "bg-ink text-paper" : "bg-paper-2 text-ink-2",
                          ].join(" ")}
                        >
                          {item.kind === "LEARN" ? "Learn" : "Review"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link
                            href={`/courses/${course.id}/check?concept=${item.concept.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.concept.name}
                          </Link>
                          {item.kind === "LEARN" ? (
                            <span className="block text-xs text-ink-3">
                              {formatMinutes(item.minutes)}
                              {item.deadline ? ` · due before ${formatDay(item.deadline)}` : ""}
                            </span>
                          ) : (
                            <span className="block text-xs text-ink-3">{formatMinutes(item.minutes)} recall practice</span>
                          )}
                          {item.lateByDays > 0 ? (
                            <span className="mt-1 block text-xs font-medium text-danger">
                              {item.lateByDays} day{item.lateByDays === 1 ? "" : "s"} past its deadline
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="flex h-fit flex-col gap-5">
        <Card className="flex flex-col gap-2 p-5 text-sm">
          <h2 className="font-semibold">This plan</h2>
          <p className="text-ink-2">
            {learnCount} topics over {days.size} study days, {formatMinutes(totalMinutes)} in total, finishing {formatDay(lastDay)}.
          </p>
          <p className="text-ink-3">
            Every topic comes after everything it depends on. Reviews are spaced 1, 3 and 7 days after learning.
          </p>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Adjust</h2>
          {settings}
        </Card>
      </aside>
    </div>
  );
}
