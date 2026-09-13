import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlanSettingsForm } from "@/components/PlanSettingsForm";
import { ProcessingState } from "@/components/ProcessingState";
import { Alert, buttonClass, Card } from "@/components/ui";
import { UploadPanel } from "@/components/UploadPanel";
import { formatBytes, formatDay, toDateInput } from "@/lib/format";
import { INGEST_ERRORS, stepsFor } from "@/lib/ingest/steps";
import { PLANS } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { getCourseOverview, getCourseStatus, uploadPrefix } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Course — Syllabus→" };

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const welcome = (await searchParams).welcome === "1";
  const { ctx } = await requireWorkspace(`/courses/${id}`);
  const [course, status] = await Promise.all([getCourseOverview(ctx, id), getCourseStatus(ctx, id)]);
  if (!course || !status) notFound();

  const job = status.job;
  const prefix = uploadPrefix(ctx, course.id);
  const failure = job?.status === "FAILED" ? (INGEST_ERRORS[job.errorCode ?? "FAILED"] ?? INGEST_ERRORS.FAILED) : null;

  // ── processing ────────────────────────────────────────────────────────────
  if (course.status === "PROCESSING" && job) {
    return (
      <Card className="p-6 sm:p-8">
        <ProcessingState
          courseId={course.id}
          steps={stepsFor(job.document.kind)}
          initialStepIndex={job.stepIndex}
          filename={job.document.filename}
        />
      </Card>
    );
  }

  // ── nothing usable yet ────────────────────────────────────────────────────
  if (course.status !== "READY") {
    return (
      <div className="flex flex-col gap-4">
        {failure ? (
          <Alert tone="error">
            <strong className="font-semibold">{failure.title}.</strong> {job?.errorCode === "NOT_A_SYLLABUS" || job?.errorCode === "TOO_THIN" ? job.errorMessage : failure.hint}
          </Alert>
        ) : null}
        <Card className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            {welcome && !failure ? <p className="text-xs font-medium text-accent">Step 3 of 3</p> : null}
            <h2 className="text-lg font-semibold">{failure ? "Try another PDF" : "Add the syllabus"}</h2>
            <p className="max-w-prose text-sm leading-relaxed text-ink-2">
              Syllabus→ reads the topics, works out which ones depend on which — a syllabus lists weeks, not
              prerequisites — and plans your study backwards from the deadlines it finds.
            </p>
          </div>
          <UploadPanel courseId={course.id} prefix={prefix} />
        </Card>
      </div>
    );
  }

  // ── ready ─────────────────────────────────────────────────────────────────
  const datedAssessments = course.assessments.filter((a) => a.dueDate);
  const noDates = course.planStatus === "NO_DATES";

  return (
    <div className="flex flex-col gap-6">
      {failure ? (
        <Alert tone="error">
          <strong className="font-semibold">Your last upload wasn&apos;t used: {failure.title.toLowerCase()}.</strong>{" "}
          {failure.hint} Your existing map is unchanged.
        </Alert>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <Stat value={course._count.concepts} label="topics" />
        <Stat value={course._count.edges} label="prerequisite links" />
        <Stat value={course.assessments.length} label="assessments" />
      </div>

      {noDates ? (
        <Card className="flex flex-col gap-4 border-accent/30 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">No dates found in this syllabus</h2>
            <p className="max-w-prose text-sm leading-relaxed text-ink-2">
              {course.assessments.length
                ? `It lists ${course.assessments.length} assessment${course.assessments.length === 1 ? "" : "s"}, but none with a date that can be pinned to the calendar${course.assessments.some((a) => a.dueDateRaw) ? ` (it says things like “${course.assessments.find((a) => a.dueDateRaw)!.dueDateRaw}”)` : ""}.`
                : "It doesn't list any dated exams or assignments."}{" "}
              Rather than guess, set your exam date and the plan is built from that.
            </p>
          </div>
          <PlanSettingsForm
            courseId={course.id}
            examDate={toDateInput(course.examDate)}
            minutesPerDay={course.minutesPerDay}
            submitLabel="Build my schedule"
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Your schedule is ready</h2>
            <p className="text-sm text-ink-2">
              {course.lateConcepts > 0
                ? `${course.lateConcepts} topic${course.lateConcepts === 1 ? "" : "s"} can't fit before ${course.lateConcepts === 1 ? "its" : "their"} deadline at ${course.minutesPerDay} minutes a day.`
                : `Every topic lands before its deadline at ${course.minutesPerDay} minutes a day.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/courses/${course.id}/graph`} className={buttonClass("secondary")}>
              See the map
            </Link>
            <Link href={`/courses/${course.id}/schedule`} className={buttonClass("primary")}>
              Open schedule
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Assessments</h2>
          {course.assessments.length === 0 ? (
            <p className="text-sm text-ink-3">None listed in the syllabus.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {course.assessments.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words">
                    {a.title}
                    {a.weight !== null ? <span className="text-ink-3"> · {a.weight}%</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-ink-2">
                    {a.dueDate ? formatDay(a.dueDate) : a.dueDateRaw ? <span className="text-ink-3">“{a.dueDateRaw}”</span> : <span className="text-ink-3">no date</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {course.assessments.length > 0 && datedAssessments.length < course.assessments.length ? (
            <p className="text-xs text-ink-3">
              Dates in quotes couldn&apos;t be pinned to a calendar day, so they don&apos;t move the schedule.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Plan settings</h2>
          <PlanSettingsForm courseId={course.id} examDate={toDateInput(course.examDate)} minutesPerDay={course.minutesPerDay} />
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Documents</h2>
          <p className="text-sm text-ink-3">Uploading a new syllabus replaces this course&apos;s map and schedule.</p>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {course.documents.map((d) => (
            <li key={d.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{d.filename}</span>
              <span className="shrink-0 text-ink-3">
                {formatBytes(d.sizeBytes)} · {formatDay(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Replace the syllabus</summary>
          <div className="mt-3">
            <UploadPanel courseId={course.id} prefix={prefix} title="Upload a new syllabus" />
          </div>
        </details>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Past papers</h2>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-2">Pro</span>
          </div>
          <p className="max-w-prose text-sm text-ink-2">
            Every question on a past exam is matched to a topic on the map. Topics that carry more marks move earlier among
            equal deadlines, and the insights say how many marks a shaky foundation puts at risk.
          </p>
        </div>
        {course.documents.some((d) => d.kind === "PAST_PAPER") ? (
          <p className="text-sm text-ink-3">
            {course.documents.filter((d) => d.kind === "PAST_PAPER").length} past paper(s) mapped.
          </p>
        ) : null}
        {PLANS[ctx.plan].features.pastPapers ? (
          <UploadPanel
            courseId={course.id}
            prefix={prefix}
            kind="PAST_PAPER"
            title="Upload a past paper"
            hint="A previous exam for this course, as a PDF. Up to 25 MB."
          />
        ) : ctx.isDemo ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/pricing" className={buttonClass("primary")}>
              Unlock with Pro
            </Link>
            <span className="text-sm text-ink-3">${PLANS.pro.priceMonthlyUsd}/month · cancel any time</span>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card className="flex flex-col gap-0.5 p-4">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-ink-3">{label}</span>
    </Card>
  );
}
