"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { answerCheckAction, flagQuestionAction, type AnswerResult } from "@/app/(app)/courses/[id]/check/actions";
import { Alert, Button, buttonClass, Card } from "@/components/ui";
import { BAND_LABEL } from "@/components/mastery";

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function PracticeCard({
  question,
  demo,
}: {
  question: { id: string; stem: string; options: string[]; conceptName: string };
  demo: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [flagged, setFlagged] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const answered = result?.ok === true;

  function choose(index: number) {
    if (answered || pending) return;
    setChosen(index);
    startTransition(async () => setResult(await answerCheckAction(question.id, index)));
  }

  function next() {
    startTransition(() => router.refresh());
  }

  function flag() {
    startTransition(async () => {
      const r = await flagQuestionAction(question.id);
      setFlagged(r.ok ? "Thanks — this question won't be shown again, and it no longer counts toward your mastery." : (r.error ?? "Couldn't flag it."));
    });
  }

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{question.conceptName}</p>
        <h2 className="text-base leading-relaxed font-medium whitespace-pre-line sm:text-lg">{question.stem}</h2>
      </div>

      <ol className="flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isKey = answered && result.answerIndex === i;
          const isWrongPick = answered && chosen === i && !result.correct;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => choose(i)}
                disabled={answered || pending}
                aria-pressed={chosen === i}
                className={[
                  "flex min-h-12 w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm leading-relaxed transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default",
                  isKey ? "border-success bg-success-soft" : isWrongPick ? "border-danger bg-danger-soft" : "border-line bg-white",
                  !answered && !pending ? "hover:border-ink-3" : "",
                  !answered && chosen === i ? "border-ink" : "",
                ].join(" ")}
              >
                <span className="mt-px font-mono text-xs text-ink-3">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 whitespace-pre-line">{option}</span>
                {isKey ? <span className="text-success">✓</span> : isWrongPick ? <span className="text-danger">✕</span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      {result && !result.ok ? (
        <Alert tone={result.limitHit ? "info" : "error"}>
          {result.error}{" "}
          {result.limitHit ? (
            <Link href="/pricing" className="font-medium underline underline-offset-4">
              See Pro
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {answered ? (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className={`rounded-lg px-4 py-3 text-sm ${result.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
            <p className={`font-semibold ${result.correct ? "text-success" : "text-danger"}`}>
              {result.correct ? "Correct." : `Not quite — the answer is ${String.fromCharCode(65 + result.answerIndex)}.`}
            </p>
            <p className="mt-1 leading-relaxed text-ink">{result.explanation}</p>
          </div>
          <p className="text-sm text-ink-2">
            {result.conceptName}: estimated {pct(result.before)} → <strong className="text-ink">{pct(result.after)}</strong>{" "}
            <span className="text-ink-3">({BAND_LABEL[result.band].toLowerCase()})</span>
            {!result.saved ? <span className="text-ink-3"> · demo, not saved</span> : null}
          </p>
          {flagged ? <Alert tone="info">{flagged}</Alert> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={next} disabled={pending}>
              {pending ? "Loading…" : "Next question"}
            </Button>
            {!flagged && !demo ? (
              <button type="button" onClick={flag} disabled={pending} className={buttonClass("ghost", "text-sm")}>
                This question is wrong
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-3">{pending ? "Marking…" : "Pick an answer. You'll see the working either way."}</p>
      )}
    </Card>
  );
}
