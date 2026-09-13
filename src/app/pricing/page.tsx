import type { Metadata } from "next";
import Link from "next/link";

import { UpgradeButton } from "@/components/BillingButtons";
import { buttonClass, Card, Wordmark } from "@/components/ui";
import { billingEnabled } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing — Syllabus→" };

const limit = (n: number | null, unit: string) => (n === null ? `Unlimited ${unit}` : `${n} ${unit}`);

/** Every line here is read from src/lib/plans.ts — the same table the limits are enforced from. */
export default async function PricingPage() {
  const session = await getSession();
  const free = PLANS.free;
  const pro = PLANS.pro;

  const rows = [
    { label: "Courses", free: limit(free.limits.courses, free.limits.courses === 1 ? "course" : "courses"), pro: limit(pro.limits.courses, "courses") },
    { label: "Documents", free: limit(free.limits.documents, "documents"), pro: limit(pro.limits.documents, "documents") },
    { label: "Practice", free: limit(free.limits.checksPerDay, "questions a day"), pro: limit(pro.limits.checksPerDay, "questions") },
    { label: "Prerequisite map, schedule, insights", free: "Included", pro: "Included" },
    { label: "Past papers → exam weighting", free: "—", pro: "Included" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 pb-16 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <Link href={session ? "/dashboard" : "/sign-in"} className={buttonClass("ghost")}>
          {session ? "Dashboard" : "Sign in"}
        </Link>
      </header>

      <section className="flex flex-col gap-3 pt-10 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">One course free. Every course for $8.</h1>
        <p className="max-w-2xl text-ink-2">
          Free gets one course planned properly. Pro is for a full term: every course, and past papers that weight your plan
          by what&apos;s actually examined.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">{free.name}</h2>
            <p className="text-sm text-ink-2">{free.tagline}</p>
          </div>
          <p className="text-3xl font-semibold">
            $0<span className="text-base font-normal text-ink-3"> / month</span>
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((r) => (
              <li key={r.label} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="text-ink-2">{r.label}</span>
                <span className="text-right">{r.free}</span>
              </li>
            ))}
          </ul>
          <Link href={session ? "/dashboard" : "/sign-up"} className={buttonClass("secondary", "mt-auto")}>
            {session ? "Go to dashboard" : "Start free"}
          </Link>
        </Card>

        <Card className="flex flex-col gap-5 border-ink p-6">
          <div>
            <h2 className="text-lg font-semibold">
              {pro.name} <span className="text-accent">→</span>
            </h2>
            <p className="text-sm text-ink-2">{pro.tagline}</p>
          </div>
          <p className="text-3xl font-semibold">
            ${pro.priceMonthlyUsd}
            <span className="text-base font-normal text-ink-3"> / month</span>
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((r) => (
              <li key={r.label} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="text-ink-2">{r.label}</span>
                <span className="text-right font-medium">{r.pro}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-2">
            <UpgradeButton signedIn={Boolean(session)} enabled={billingEnabled} />
            {billingEnabled ? (
              <p className="text-xs text-ink-3">
                Test mode during judging: pay with card <span className="font-mono">4242 4242 4242 4242</span>, any future date,
                any CVC. Nothing is charged.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
