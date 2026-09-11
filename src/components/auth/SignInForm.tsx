"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ googleEnabled, next }: { googleEnabled: boolean; next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    setPending(true);
    setError(null);
    setUnverified(null);
    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get("password") ?? ""),
    });
    setPending(false);

    if (error) {
      // Better Auth answers 403 when the password is right but the address has
      // never been confirmed. That is a different problem with a different fix.
      if (error.status === 403) setUnverified(email);
      else setError("That email and password don't match.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>

      {googleEnabled ? (
        <div className="mt-6 flex flex-col gap-4">
          <GoogleButton next={next} />
          <div className="flex items-center gap-3 text-xs text-ink-3">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {unverified ? (
          <div className="flex flex-col gap-3">
            <Alert tone="info">
              Confirm your email first — we sent a link to <strong>{unverified}</strong>. Check spam if it isn&apos;t
              there.
            </Alert>
            <ResendVerification email={unverified} />
          </div>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-2">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
