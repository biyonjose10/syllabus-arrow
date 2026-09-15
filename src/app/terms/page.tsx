import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Terms — Syllabus→" };

const CONTACT = "monkeswag69@gmail.com";

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-16 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
      </header>

      <article className="flex flex-col gap-6 pt-10 text-sm leading-relaxed text-ink-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of service</h1>
          <p className="text-ink-3">Last updated 15 September 2026</p>
        </div>

        <p>
          Syllabus→ is a study planner built for the AI Builders Hackathon 2026. By creating an account or using the demo
          course you agree to these terms.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Using Syllabus→</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Upload only documents you have the right to use, such as course material given to you.</li>
            <li>Don&apos;t try to access other people&apos;s data, overload the service, or get around plan limits.</li>
            <li>You are responsible for keeping your password safe.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">A study aid, not a guarantee</h2>
          <p>
            Prerequisite maps and practice questions are generated with AI and checked by code, but they can still be wrong.
            Mastery estimates and schedules are guidance. Your course, your teachers and your exam board are the authority on
            what you need to know and when.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Plans and payment</h2>
          <p>
            Free includes one course. Pro is $8 a month, billed through Polar, and can be cancelled from the billing page at
            any time. During the hackathon, checkout runs in test mode and no real payments are taken.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Your content</h2>
          <p>
            You keep ownership of what you upload. You let us store and process it only to provide the service, as described
            in the <Link className="font-medium text-ink underline underline-offset-4" href="/privacy">privacy policy</Link>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Availability and changes</h2>
          <p>
            Syllabus→ is provided as is, without warranties. It may change, pause or shut down, and we may suspend accounts
            that break these terms. If these terms change, the date at the top of this page changes with them.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Contact</h2>
          <p>
            <a className="font-medium text-ink underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </section>
      </article>
    </main>
  );
}
