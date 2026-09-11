import type { Metadata } from "next";
import Link from "next/link";

import { ResendVerification } from "@/components/auth/ResendVerification";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Check your inbox — Syllabus→" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).email;
  const email = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        We sent a confirmation link to {email ? <strong className="text-ink">{email}</strong> : "your email"}. Open it
        on this device and you&apos;ll land straight in your workspace.
      </p>
      <p className="mt-2 text-sm text-ink-3">Nothing after a minute? Check spam, or send it again.</p>
      <div className="mt-6">
        <ResendVerification email={email} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-2">
        Wrong address?{" "}
        <Link href="/sign-up" className="font-medium text-ink underline underline-offset-4">
          Start again
        </Link>
      </p>
    </Card>
  );
}
