"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email,
      password: String(form.get("password") ?? ""),
      // Where the link in the verification email lands once confirmed.
      callbackURL: "/dashboard",
    });
    setPending(false);

    if (error) {
      setError(error.message ?? "We couldn't create your account. Try again.");
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink-2">Free for one course. No card needed.</p>

      {googleEnabled ? (
        <div className="mt-6 flex flex-col gap-4">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-ink-3">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
