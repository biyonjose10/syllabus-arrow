import Link from "next/link";

import { buttonClass, Wordmark } from "@/components/ui";

/** Also what another workspace's course looks like — by design, indistinguishable from one that doesn't exist. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-5 py-16">
      <Wordmark className="text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-ink-2">That page doesn&apos;t exist, or it belongs to a different account.</p>
      <Link href="/dashboard" className={buttonClass("primary")}>
        Back to your courses
      </Link>
    </main>
  );
}
