"use client";

import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

type State = "idle" | "sending" | "sent" | "failed";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<State>("idle");

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!email || state === "sending" || state === "sent"}
        onClick={async () => {
          setState("sending");
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
          setState(error ? "failed" : "sent");
        }}
      >
        {state === "sending" ? "Sending…" : state === "sent" ? "Sent — check your inbox" : "Resend the email"}
      </Button>
      {state === "failed" ? (
        <Alert tone="error">That didn&apos;t send. Wait a minute and try again.</Alert>
      ) : null}
    </div>
  );
}
