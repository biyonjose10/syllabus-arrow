import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, buttonClass, Wordmark } from "@/components/ui";
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

export default async function Home({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/dashboard");
  const query = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Wordmark className="text-lg" />
        <nav className="flex items-center gap-1">
          <Link href="/pricing" className={buttonClass("ghost")}>
            Pricing
          </Link>
          <Link href="/sign-in" className={buttonClass("ghost")}>
            Sign in
          </Link>
        </nav>
      </header>

      <section className="pt-12 pb-16 sm:pt-20">
        {query.demo === "unavailable" ? (
          <div className="mb-6 max-w-xl">
            <Alert tone="info">The demo course is being refreshed. Try again in a minute, or create a free account.</Alert>
          </div>
        ) : null}
        <p className="mb-4 text-sm font-medium text-accent">For students with an exam date</p>
        <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-6xl">
          Every student gets a syllabus in week one and a panic in week eleven.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Syllabus→ turns your course documents into a map of what depends on what, a schedule that works back from your
          exam, and practice that knows what you can&apos;t do yet — including the things you think you can.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={buttonClass("primary", "h-12 px-6 text-base")}>
            Start free
          </Link>
          {/* A plain link: this is a route handler that signs in and redirects, not a page to prefetch. */}
          <a href="/api/demo" className={buttonClass("secondary", "h-12 px-6 text-base")}>
            Try the demo course
          </a>
        </div>
        <p className="mt-3 text-sm text-ink-3">Free for one course. No card needed. The demo needs no account.</p>
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

      <section className="grid gap-6 border-t border-line py-12 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">The model draws the map. Code decides what you know.</h2>
          <p className="text-sm leading-relaxed text-ink-2">
            AI reads the syllabus and writes the practice questions. Everything that judges you — the schedule, your mastery
            estimate, the warnings — is ordinary, tested code that never asks a model. Every question&apos;s answer is
            confirmed by a second, blind solve before it can count.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">It will tell you when you&apos;re wrong about yourself.</h2>
          <p className="text-sm leading-relaxed text-ink-2">
            Mark a topic done, then keep missing the topics built on it, and Syllabus→ says so — with how many answers, and
            how many exam topics depend on it. It stays quiet until the evidence is real.
          </p>
        </div>
      </section>
    </main>
  );
}
