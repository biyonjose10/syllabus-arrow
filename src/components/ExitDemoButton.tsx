"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/** Leaves the shared demo session, then goes to sign-up — which refuses anyone already signed in. */
export function ExitDemoButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/sign-up");
        router.refresh();
      }}
      className="shrink-0 font-semibold underline underline-offset-4"
    >
      {pending ? "One moment…" : "Make my own — free →"}
    </button>
  );
}
