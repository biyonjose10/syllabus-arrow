import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Wordmark } from "@/components/ui";
import { getSession } from "@/lib/session";

const STEPS = [
  {
    title: "Upload the syllabus",
    body: "The PDF you got in week one — scanned, tabled, messy. It is read whole, layout and all.",
  },
  {
    title: "Get the prerequisite map",
    body: "Not a topic list. Which ideas you cannot learn without which, with the reason for every arrow.",
  },
  {
    title: "Earn every tick",
    body: "Practice checks update what you actually know — and say so when it disagrees with what you marked done.",
  },
];

export default async function Home() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Wordmark className="text-lg" />
        <Link href="/sign-in" className={buttonClass("ghost")}>
          Sign in
        </Link>
      </header>

      <section className="pb-16 pt-12 sm:pt-20">
        <p className="mb-4 text-sm font-medium text-accent">For students with an exam date</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Every student gets a syllabus in week one and a panic in week eleven.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Syllabus→ turns your course documents into a map of what depends on what, a schedule that works back
          from your exam, and practice that knows what you can&apos;t do yet — including the things you think you can.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={buttonClass("primary", "h-12 px-6 text-base")}>
            Start free
          </Link>
          <Link href="/sign-in" className={buttonClass("secondary", "h-12 px-6 text-base")}>
            I have an account
          </Link>
        </div>
        <p className="mt-3 text-sm text-ink-3">Free for one course. No card needed.</p>
      </section>

      <section className="grid gap-4 border-t border-line py-12 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex flex-col gap-2">
            <span className="font-mono text-sm text-ink-3">0{i + 1}</span>
            <h2 className="text-base font-semibold">{step.title}</h2>
            <p className="text-sm leading-relaxed text-ink-2">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
