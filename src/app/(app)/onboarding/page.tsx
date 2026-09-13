import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Card } from "@/components/ui";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Plan your first course — Syllabus→" };

export default async function OnboardingPage() {
  await requireWorkspace("/onboarding");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plan a course</h1>
        <p className="text-sm text-ink-2">Two quick questions, then the syllabus.</p>
      </div>
      <Card className="p-6">
        <OnboardingWizard />
      </Card>
    </div>
  );
}
