import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/SignUpForm";
import { googleEnabled } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account — Syllabus→" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return <SignUpForm googleEnabled={googleEnabled} />;
}
