"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonClass, Wordmark } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-5 py-16">
      <Wordmark className="text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Something broke on our side</h1>
      <p className="text-ink-2">
        Nothing you did caused this, and your courses are safe. Try again — if it keeps happening, the demo course still
        works.
      </p>
      {error.digest ? <p className="font-mono text-xs text-ink-3">Reference: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={buttonClass("secondary")}>
          Your courses
        </Link>
      </div>
    </main>
  );
}
