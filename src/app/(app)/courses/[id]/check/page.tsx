import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/AutoRefresh";
import { PracticeCard } from "@/components/PracticeCard";
import { buttonClass, Card } from "@/components/ui";
import { UsageMeter } from "@/components/UsageMeter";
import { chooseQuestion } from "@/lib/mastery/select";
import { PLANS } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { getChecksUsedToday, getPracticeState, getQuestionForPractice } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Practice — Syllabus→" };

export default async function CheckPage({ params, searchParams }: PageProps<"/courses/[id]/check">) {
  const { id } = await params;
  const query = await searchParams;
  const focus = typeof query.concept === "string" ? query.concept : null;

  const { ctx } = await requireWorkspace(`/courses/${id}/check`);
  const [state, usedToday] = await Promise.all([getPracticeState(ctx, id), getChecksUsedToday(ctx)]);
  if (!state) notFound();

  if (state.course.status !== "READY") {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-lg font-semibold">Practice starts after the map</h2>
        <p className="text-sm text-ink-2">Upload the syllabus first — questions are written for each topic on its map.</p>
        <Link href={`/courses/${id}`} className={buttonClass("primary")}>
          Upload a syllabus
        </Link>
      </Card>
    );
  }

  if (state.questions.length === 0) {
    const failed = state.course.checksStatus === "FAILED";
    return (
      <Card className="flex flex-col gap-3 p-6">
        {failed ? null : <AutoRefresh everyMs={6_000} />}
        <h2 className="text-lg font-semibold">
          {failed ? "Practice questions couldn't be written right now" : "Writing your practice questions…"}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-ink-2">
          {failed
            ? "The AI reader was unavailable or at today's capacity. Your map and schedule are unaffected — try again later, or open the demo course to see practice in action."
            : "Every question is written, then answered blind by a second, independent reader. Only questions where both agree on the answer are kept — so a wrong answer key never counts against you. This takes a minute or two; this page updates on its own."}
        </p>
      </Card>
    );
  }

  const questionId = chooseQuestion({
    questions: state.questions,
    timesAnswered: state.timesAnswered,
    mastery: state.mastery,
    due: state.due,
    focusConceptId: focus,
    // Total answers so far: changes after every answer, stable across re-renders.
    salt: [...state.timesAnswered.values()].reduce((sum, n) => sum + n, 0),
  });
  const question = questionId ? await getQuestionForPractice(ctx, questionId) : null;
  if (!question) notFound();

  const limit = PLANS[ctx.plan].limits.checksPerDay;
  const focusName = focus ? state.concepts.find((c) => c.id === focus)?.name : null;
  const focusHasQuestions = focus ? state.questions.some((q) => q.conceptId === focus) : false;
  const practised = new Set([...state.mastery.keys()]).size;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-3">
        {focusName ? (
          <p className="text-sm text-ink-2">
            {focusHasQuestions ? (
              <>
                Practising <strong className="text-ink">{focusName}</strong> ·{" "}
              </>
            ) : (
              <>
                No verified questions for <strong className="text-ink">{focusName}</strong> yet, so here&apos;s another topic ·{" "}
              </>
            )}
            <Link href={`/courses/${id}/check`} className="underline underline-offset-4">
              any topic
            </Link>
          </p>
        ) : null}
        <PracticeCard
          key={question.id}
          demo={ctx.isDemo}
          question={{ id: question.id, stem: question.stem, options: question.options, conceptName: question.concept.name }}
        />
      </div>

      <aside className="flex h-fit flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5 text-sm">
          <h2 className="font-semibold">How this is marked</h2>
          <p className="text-ink-2">
            {state.questions.length} verified questions across {new Set(state.questions.map((q) => q.conceptId)).size} topics.
            Each answer updates a Bayesian Knowledge Tracing estimate — one lucky guess doesn&apos;t make a topic mastered, one
            slip doesn&apos;t undo a run.
          </p>
          <p className="text-ink-3">{practised} of {state.concepts.length} topics practised so far.</p>
        </Card>
        {ctx.isDemo ? null : (
          <Card className="p-5">
            <UsageMeter label="Practice today" used={usedToday} max={limit} />
          </Card>
        )}
      </aside>
    </div>
  );
}
