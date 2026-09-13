"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Job = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  stepIndex: number;
  stepCount: number;
  createdAt: string;
  document: { filename: string };
};

type StatusResponse = { status: string; job: Job | null; steps: string[] };

/**
 * Live progress for an ingest job. Each row lights up when the job's own
 * IngestJob row says that step has started — there is no fake timer here.
 * When the job finishes either way, the server page re-renders with the result.
 */
export function ProcessingState({ courseId, steps, initialStepIndex, filename }: {
  courseId: string;
  steps: readonly string[];
  initialStepIndex: number;
  filename: string;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [queued, setQueued] = useState(initialStepIndex === 0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/courses/${courseId}/status`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as StatusResponse;
          if (data.job) {
            setStepIndex(data.job.stepIndex);
            setQueued(data.job.status === "QUEUED");
          }
          if (data.status !== "PROCESSING" || data.job?.status === "SUCCEEDED" || data.job?.status === "FAILED") {
            router.refresh();
            return;
          }
        }
      } catch {
        // A dropped poll on a flaky phone connection is not an error; try again.
      }
      setSlow(Date.now() - started > 90_000);
      if (!stopped) timer = setTimeout(poll, 2_000);
    }

    timer = setTimeout(poll, 1_500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [courseId, router]);

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Reading {filename}</h2>
        <p className="text-sm text-ink-2">
          {queued ? "Waiting for a worker…" : "This usually takes under a minute. You can leave this page — it keeps going."}
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < stepIndex ? "done" : n === stepIndex ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className={[
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  state === "done" ? "border-success bg-success text-white" : "",
                  state === "active" ? "animate-pulse border-accent bg-accent-soft text-accent" : "",
                  state === "pending" ? "border-line text-ink-3" : "",
                ].join(" ")}
              >
                {state === "done" ? "✓" : n}
              </span>
              <span className={state === "pending" ? "text-ink-3" : state === "active" ? "font-medium" : "text-ink-2"}>
                {label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "active" ? " (in progress)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {slow ? (
        <p className="text-sm text-ink-3">
          Taking longer than usual — the AI reader is busy, so the job is waiting its turn and will retry on its own.
        </p>
      ) : null}
    </div>
  );
}
