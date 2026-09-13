"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markDoneAction } from "@/app/(app)/courses/[id]/check/actions";
import { buttonClass } from "@/components/ui";

export function MarkDoneButton({
  conceptId,
  done,
  demo = false,
  className = "",
  onChange,
}: {
  conceptId: string;
  done: boolean;
  demo?: boolean;
  className?: string;
  onChange?: (done: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (demo) {
    return <span className="text-xs text-ink-3">{done ? "✓ Marked done (demo)" : "Demo is view-only"}</span>;
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await markDoneAction(conceptId, !done);
            if (!r.ok) return setError(r.error ?? "Couldn't save that.");
            setError(null);
            onChange?.(!done);
            router.refresh();
          })
        }
        className={buttonClass(done ? "secondary" : "primary", className)}
      >
        {pending ? "Saving…" : done ? "✓ Marked done — undo" : "Mark as done"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
