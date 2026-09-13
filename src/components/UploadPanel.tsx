"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { registerUploadAction } from "@/app/(app)/courses/[id]/actions";
import { Alert } from "@/components/ui";
import { MAX_UPLOAD_BYTES, MULTIPART_THRESHOLD_BYTES, safeFilename } from "@/lib/uploads";

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "registering" } | { name: "error"; message: string; limitHit?: boolean };

/**
 * PDF → private Blob storage, straight from the browser, then registered on
 * the server (which re-checks everything) and handed to the ingest job.
 *
 * The wrong-format message is specific on purpose: "PDF only" is not enough
 * for a student holding a .docx at 1am — it says how to make the PDF.
 */
function formatProblem(file: File): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return null;
  if (/\.docx?$/i.test(file.name) || file.type.includes("word")) {
    return "That's a Word document. Syllabus→ reads PDFs for now — in Word use File → Save As → PDF (Google Docs: File → Download → PDF), then upload that.";
  }
  if (/\.pptx?$/i.test(file.name)) {
    return "That's a slide deck. Syllabus→ reads PDF syllabi for now — export it as a PDF, or upload the course outline instead.";
  }
  if (file.type.startsWith("image/")) {
    return "That's an image. Syllabus→ reads PDFs for now — most phone scanner apps can save a scan as a PDF.";
  }
  return "Syllabus→ reads PDFs for now. Export the file as a PDF and upload that.";
}

export function UploadPanel({
  courseId,
  prefix,
  kind = "SYLLABUS",
  title = "Upload the syllabus",
  hint = "The PDF that lists the course topics. Up to 25 MB.",
}: {
  courseId: string;
  prefix: string;
  kind?: "SYLLABUS" | "PAST_PAPER";
  title?: string;
  hint?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = phase.name === "uploading" || phase.name === "registering";

  async function handleFile(file: File) {
    const problem = formatProblem(file);
    if (problem) return setPhase({ name: "error", message: problem });
    if (file.size > MAX_UPLOAD_BYTES) {
      return setPhase({ name: "error", message: "That PDF is over 25 MB. Try compressing it, or upload only the syllabus pages." });
    }
    if (file.size === 0) return setPhase({ name: "error", message: "That file is empty." });

    setPhase({ name: "uploading", percent: 0 });
    let pathname: string;
    try {
      const blob = await upload(`${prefix}${safeFilename(file.name)}`, file, {
        access: "private",
        contentType: "application/pdf",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ courseId, kind }),
        multipart: file.size > MULTIPART_THRESHOLD_BYTES,
        onUploadProgress: ({ percentage }) => setPhase({ name: "uploading", percent: Math.round(percentage) }),
      });
      pathname = blob.pathname;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // The token route's own words (plan limit, demo, not found) are worth showing.
      const readable = message.match(/(The \w+ plan includes[^"]*|Past papers are part of Pro\.|The demo course is view-only[^"]*)/)?.[1];
      return setPhase({
        name: "error",
        message: readable ?? "The upload didn't go through. Check your connection and try again.",
        limitHit: Boolean(readable && !readable.startsWith("The demo")),
      });
    }

    setPhase({ name: "registering" });
    const result = await registerUploadAction({ courseId, pathname, filename: file.name, kind });
    if (!result.ok) return setPhase({ name: "error", message: result.error, limitHit: result.limitHit });

    setPhase({ name: "idle" });
    router.refresh();
  }

  function onPick(files: FileList | null) {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (file && !busy) void handleFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files);
        }}
        className={[
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
          dragging ? "border-accent bg-accent-soft" : "border-line bg-paper hover:border-ink-3",
          busy ? "pointer-events-none opacity-80" : "",
        ].join(" ")}
      >
        <span aria-hidden className="text-2xl text-accent">
          ↑
        </span>
        <span className="font-medium">
          {phase.name === "uploading"
            ? `Uploading… ${phase.percent}%`
            : phase.name === "registering"
              ? "Starting the reader…"
              : title}
        </span>
        <span className="max-w-sm text-sm text-ink-3">
          {busy ? "Keep this page open for a moment." : <>Tap to choose a PDF, or drop it here. {hint}</>}
        </span>
        {phase.name === "uploading" ? (
          <span className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-paper-2" aria-hidden>
            <span className="block h-full bg-accent transition-[width]" style={{ width: `${phase.percent}%` }} />
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>
      {phase.name === "error" ? (
        <Alert tone={phase.limitHit ? "info" : "error"}>
          {phase.message}{" "}
          {phase.limitHit ? (
            <a href="/pricing" className="font-medium underline underline-offset-4">
              See Pro
            </a>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
