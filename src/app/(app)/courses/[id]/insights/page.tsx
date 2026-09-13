import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkDoneButton } from "@/components/MarkDoneButton";
import { BandChip } from "@/components/mastery";
import { buttonClass, Card } from "@/components/ui";
import { masteryBand } from "@/lib/mastery/bkt";
import { FAILURE_RATE, findInsights, MIN_ATTEMPTS } from "@/lib/mastery/insights";
import { examWeights } from "@/lib/schedule/exam-weight";
import { requireWorkspace } from "@/lib/session";
import { getMasteryOverview } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Insights — Syllabus→" };

export default async function InsightsPage({ params }: PageProps<"/courses/[id]/insights">) {
  const { id } = await params;
  const { ctx } = await requireWorkspace(`/courses/${id}/insights`);
  const data = await getMasteryOverview(ctx, id);
  if (!data) notFound();

  if (data.concepts.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-lg font-semibold">Nothing to say yet</h2>
        <p className="text-sm text-ink-2">Upload the syllabus, practise, and this page tells you what you really know.</p>
        <Link href={`/courses/${id}`} className={buttonClass("primary")}>
          Upload a syllabus
        </Link>
      </Card>
    );
  }

  const edges = data.edges.map((e) => ({ from: e.fromId, to: e.toId }));
  const weights = examWeights(data.examQuestions);
  const examConcepts = new Set([...data.assessments.flatMap((a) => a.conceptIds), ...data.examQuestions.map((q) => q.conceptId)]);
  const insights = findInsights({
    conceptIds: data.concepts.map((c) => c.id),
    edges,
    markedDone: data.markedDone,
    attempts: data.attempts,
    examConcepts,
    examWeight: weights.size ? weights : undefined,
  });
  const name = new Map(data.concepts.map((c) => [c.id, c.name]));
  const contradicted = new Set(insights.map((i) => i.conceptId));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Where your evidence disagrees with you</h2>
          <p className="max-w-prose text-sm text-ink-2">
            Only topics you marked done, and only with at least {MIN_ATTEMPTS} answers of which {Math.round(FAILURE_RATE * 100)}% or
            more were wrong. Flagged questions never count.
          </p>
        </div>

        {insights.length === 0 ? (
          <Card className="p-5 text-sm text-ink-2">
            {data.markedDone.size === 0
              ? "You haven't marked any topics done yet. Mark what you believe you know on the map, then practise — this is where Syllabus→ checks the claim."
              : data.attempts.length < MIN_ATTEMPTS
                ? "Not enough practice yet to judge anything. Answer a few more questions."
                : "Nothing contradicts you so far. Everything you marked done is holding up."}
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {insights.map((insight) => (
              <li key={`${insight.conceptId}-${insight.kind}`}>
                <Card className="flex flex-col gap-3 border-danger/30 p-5">
                  <p className="text-base leading-relaxed">
                    You marked <strong>{name.get(insight.conceptId)}</strong> done —{" "}
                    {insight.kind === "OWN" ? (
                      <>
                        but <strong>{insight.wrong} of {insight.attempts}</strong> answers on it were wrong.
                      </>
                    ) : (
                      <>
                        but <strong>{insight.wrong} of {insight.attempts}</strong> answers on topics that need it were wrong.
                      </>
                    )}
                  </p>
                  {insight.weakestDependents.length ? (
                    <p className="text-sm text-ink-2">
                      Weakest:{" "}
                      {insight.weakestDependents
                        .map((d) => `${name.get(d.conceptId)} (${d.wrong} of ${d.attempts} wrong)`)
                        .join(", ")}
                      .
                    </p>
                  ) : null}
                  <p className="text-sm text-ink-2">
                    {insight.examTopicsTotal > 0 ? (
                      <>
                        <strong className="text-ink">
                          {insight.examTopicsExposed} of {insight.examTopicsTotal}
                        </strong>{" "}
                        examined topics depend on it
                      </>
                    ) : (
                      "No assessments are linked to topics yet"
                    )}
                    {insight.examWeightExposed !== null ? (
                      <>
                        {" "}
                        — <strong className="text-ink">{Math.round(insight.examWeightExposed * 100)}%</strong> of past-paper marks
                      </>
                    ) : null}
                    .
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/courses/${id}/check?concept=${insight.conceptId}`} className={buttonClass("primary")}>
                      Practise {name.get(insight.conceptId)}
                    </Link>
                    <MarkDoneButton conceptId={insight.conceptId} done demo={ctx.isDemo} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Every topic</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Topic</th>
                <th className="px-4 py-2 font-medium">Estimate</th>
                <th className="px-4 py-2 font-medium">Answers</th>
                <th className="px-4 py-2 font-medium">You said</th>
                {weights.size ? <th className="px-4 py-2 font-medium">Exam marks</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.concepts.map((c) => {
                const m = data.mastery.get(c.id);
                const band = masteryBand(m?.pKnown, m?.attempts ?? 0);
                return (
                  <tr key={c.id} className={contradicted.has(c.id) ? "bg-danger-soft/40" : ""}>
                    <td className="px-4 py-2.5">
                      <Link href={`/courses/${id}/check?concept=${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <BandChip band={band} />
                      {m?.attempts ? <span className="ml-2 text-xs text-ink-3">{Math.round(m.pKnown * 100)}%</span> : null}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-2">{m ? `${m.correct}/${m.attempts} right` : "—"}</td>
                    <td className="px-4 py-2.5 text-ink-2">{data.markedDone.has(c.id) ? "Done" : "—"}</td>
                    {weights.size ? (
                      <td className="px-4 py-2.5 tabular-nums text-ink-2">
                        {weights.get(c.id) ? `${Math.round(weights.get(c.id)! * 100)}%` : "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
