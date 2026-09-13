import type { Metadata } from "next";

import { AutoRefresh } from "@/components/AutoRefresh";
import { ManageSubscriptionButton, UpgradeButton } from "@/components/BillingButtons";
import { Alert, Card } from "@/components/ui";
import { UsageMeter } from "@/components/UsageMeter";
import { billingEnabled } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { getBilling } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Plan and billing — Syllabus→" };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { ctx } = await requireWorkspace("/billing");
  const query = await searchParams;
  const billing = await getBilling(ctx);
  const plan = PLANS[billing.plan];
  const justPaid = typeof query.checkout_id === "string";
  const waitingForWebhook = justPaid && billing.plan !== "pro";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Plan and billing</h1>

      {waitingForWebhook ? (
        <Alert tone="info">
          <AutoRefresh everyMs={3_000} />
          Payment received — confirming with Polar. This page updates by itself in a few seconds.
        </Alert>
      ) : justPaid ? (
        <Alert tone="success">You&apos;re on Pro. Every limit below is lifted.</Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-ink-3">Current plan</p>
            <p className="text-xl font-semibold">{plan.name}</p>
          </div>
          <p className="text-sm text-ink-2">
            {billing.plan === "pro" ? `$${plan.priceMonthlyUsd}/month` : "Free forever"}
          </p>
        </div>
        {billing.subscription ? (
          <p className="text-sm text-ink-2">
            Subscription {billing.subscription.status}
            {billing.subscription.currentPeriodEnd ? ` · renews or ends ${formatDay(billing.subscription.currentPeriodEnd)}` : ""}
          </p>
        ) : null}
        {billing.isDemo ? (
          <p className="text-sm text-ink-3">The demo workspace has no billing. Create your own account to try checkout.</p>
        ) : billing.plan === "pro" ? (
          billingEnabled ? <ManageSubscriptionButton /> : null
        ) : (
          <UpgradeButton signedIn enabled={billingEnabled} label={`Upgrade to Pro — $${PLANS.pro.priceMonthlyUsd}/month`} />
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="font-semibold">Usage</h2>
        <UsageMeter label="Courses" used={billing.usage.courses} max={plan.limits.courses} />
        <UsageMeter label="Documents" used={billing.usage.documents} max={plan.limits.documents} />
        <UsageMeter label="Practice questions today" used={billing.usage.checksToday} max={plan.limits.checksPerDay} />
      </Card>
    </div>
  );
}
