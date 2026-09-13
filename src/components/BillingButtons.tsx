"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Button, buttonClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

/** Opens Polar checkout for Pro. Signed-out visitors are sent to sign up first. */
export function UpgradeButton({
  signedIn,
  enabled,
  className = "",
  label = "Upgrade to Pro",
}: {
  signedIn: boolean;
  enabled: boolean;
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href="/sign-up?next=/pricing" className={buttonClass("primary", className)}>
        Start free, upgrade any time
      </Link>
    );
  }
  if (!enabled) {
    return (
      <Button disabled className={className}>
        Checkout opens soon
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className={className}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          // Redirects to Polar's hosted checkout on success.
          const { error } = await authClient.checkout({ slug: "pro" });
          if (error) {
            setPending(false);
            setError("Checkout couldn't open. Try again in a moment.");
          }
        }}
      >
        {pending ? "Opening checkout…" : label}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

export function ManageSubscriptionButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const { error } = await authClient.customer.portal();
        if (error) setPending(false);
      }}
    >
      {pending ? "Opening…" : "Manage subscription"}
    </Button>
  );
}
