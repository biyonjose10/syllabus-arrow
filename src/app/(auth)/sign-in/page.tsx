import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/SignInForm";
import { googleEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in — Syllabus→" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);
  return <SignInForm googleEnabled={googleEnabled} next={next} />;
}
