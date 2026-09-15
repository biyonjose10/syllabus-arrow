import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy — Syllabus→" };

const CONTACT = "monkeswag69@gmail.com";

/** Plain-language policy. Every processor named here is one the code actually calls. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-16 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
      </header>

      <article className="flex flex-col gap-6 pt-10 text-sm leading-relaxed text-ink-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy policy</h1>
          <p className="text-ink-3">Last updated 15 September 2026</p>
        </div>

        <p>
          Syllabus→ is a study planner built for the AI Builders Hackathon 2026. This page says what it stores, why, and who
          else handles it.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">What we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your account: name, email address, and a hashed password — or, if you sign in with Google, your Google name, email and profile picture.</li>
            <li>What you upload: syllabus and past-paper PDFs, stored privately.</li>
            <li>What the app builds from them: topics, prerequisite links, your schedule and practice questions.</li>
            <li>How you practise: your answers, the topics you mark done, and questions you flag.</li>
            <li>Billing status, if you upgrade: your plan and subscription state. Card details go to our payment provider and never reach us.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Why</h2>
          <p>
            Only to run the product: to sign you in, build your plan, track your practice, enforce plan limits and send account
            emails such as email verification. We do not sell your data or use it for advertising.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Who else handles it</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Vercel — hosting and private file storage.</li>
            <li>Neon — the database.</li>
            <li>Inngest — runs background processing jobs.</li>
            <li>
              Google Gemini API — the text of documents you upload is sent to it to build your map and questions. On the free
              tier, Google may use that content to improve its products.
            </li>
            <li>Google — sign-in, if you choose “Sign in with Google”, and Gmail for sending account emails.</li>
            <li>Polar — checkout and subscriptions, if you upgrade. Payments currently run in test mode.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Deleting your data</h2>
          <p>
            Email <a className="font-medium text-ink underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a> from
            the address on your account and we will delete your account and everything linked to it.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Contact</h2>
          <p>
            Questions about this policy: <a className="font-medium text-ink underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            See also the <Link className="font-medium text-ink underline underline-offset-4" href="/terms">terms of service</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
