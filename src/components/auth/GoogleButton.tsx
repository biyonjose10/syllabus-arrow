"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function GoogleButton({ next = "/dashboard" }: { next?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        // Navigates away to Google on success; only returns here on failure.
        const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next });
        if (error) setPending(false);
      }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
      </svg>
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}
