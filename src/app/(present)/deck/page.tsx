import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/ui";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Syllabus→ — pitch deck" };

/**
 * The 10-slide deck, rendered by the app itself so every number on it comes
 * from the same code the product runs. Print to PDF from the browser
 * (landscape, margins none, background graphics on).
 */

function Slide({ n, children, dark = false }: { n: number; children: ReactNode; dark?: boolean }) {
  return (
    <section
      className={`deck-slide relative mx-auto flex aspect-video w-full max-w-[1280px] flex-col overflow-hidden rounded-xl border border-line p-[4.5%] ${dark ? "bg-ink text-paper" : "bg-white text-ink"}`}
    >
      {children}
      <div className={`absolute right-[4.5%] bottom-[4%] flex items-center gap-3 text-[1.1vw] print:text-[11pt] ${dark ? "text-paper/60" : "text-ink-3"}`}>
        <Wordmark /> <span className="font-mono">{n}/10</span>
      </div>
    </section>
  );
}

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="text-[3.1vw] leading-[1.1] font-semibold tracking-tight print:text-[30pt]">{children}</h2>
);
const Lead = ({ children }: { children: ReactNode }) => (
  <p className="mt-[2%] max-w-[85%] text-[1.55vw] leading-snug text-ink-2 print:text-[16pt]">{children}</p>
);

function Box({ title, body, accent = false }: { title: string; body: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-[0.4vw] rounded-lg border p-[1.2vw] ${accent ? "border-accent bg-accent-soft" : "border-line bg-paper"}`}>
      <p className="text-[1.25vw] font-semibold print:text-[12.5pt]">{title}</p>
      <p className="text-[1.05vw] leading-snug text-ink-2 print:text-[10.5pt]">{body}</p>
    </div>
  );
}

export default function DeckPage() {
  return (
    <main className="flex flex-col gap-8 bg-paper-2 px-4 py-8 print:gap-0 print:bg-white print:p-0">
      <style>{`
        @page { size: 13.333in 7.5in; margin: 0; }
        @media print {
          .deck-slide { width: 13.333in !important; height: 7.5in !important; max-width: none !important;
            border: 0 !important; border-radius: 0 !important; break-after: page; }
        }
      `}</style>
      <p className="mx-auto max-w-[1280px] text-sm text-ink-3 print:hidden">
        Print to PDF: landscape, margins none, background graphics on.
      </p>

      {/* 1 — title */}
      <Slide n={1} dark>
        <div className="flex flex-1 flex-col justify-center gap-[2vw]">
          <p className="text-[1.4vw] font-medium text-accent print:text-[14pt]">AI Builders Hackathon 2026 · Best SaaS Product</p>
          <h1 className="text-[5.4vw] leading-[1.02] font-semibold tracking-tight print:text-[54pt]">
            Syllabus<span className="text-accent">→</span>
          </h1>
          <p className="max-w-[70%] text-[2.2vw] leading-snug text-paper/85 print:text-[22pt]">
            A term plan that knows what you can&apos;t do yet — including the things you think you can.
          </p>
          <p className="font-mono text-[1.2vw] text-paper/60 print:text-[12pt]">syllabus-arrow.vercel.app · github.com/biyonjose10/syllabus-arrow</p>
        </div>
      </Slide>

      {/* 2 — problem */}
      <Slide n={2}>
        <H>Every student gets a syllabus in week one and a panic in week eleven.</H>
        <Lead>A syllabus says when topics are taught. It never says what depends on what — so students plan by the calendar, and find the gaps when the exam does.</Lead>
        <div className="mt-auto mb-[4%] grid grid-cols-3 gap-[1.5vw]">
          <Box title="Calendars, not prerequisites" body="“Week 6: eigenvectors.” Nothing says you can't do PCA, SVD or diagonalisation without them." />
          <Box title="Self-assessment is optimistic" body="Ticking a topic “done” after reading it feels like knowing it. The first honest test is usually the exam." />
          <Box title="Late gaps are expensive" body="A shaky foundation found in week eleven takes every topic built on it down with it." />
        </div>
      </Slide>

      {/* 3 — the idea */}
      <Slide n={3}>
        <H>The model draws the map. Code decides what you know.</H>
        <Lead>Syllabus→ uses AI only where judgement about a subject is needed — and nowhere a student is judged.</Lead>
        <div className="mt-auto mb-[4%] grid grid-cols-2 gap-[2vw]">
          <div className="flex flex-col gap-[1vw]">
            <p className="text-[1.3vw] font-semibold text-accent print:text-[13pt]">AI writes</p>
            <Box title="The prerequisite map" body="Concepts and the edges between them, each with a reason about understanding — inferred, because no syllabus states them." />
            <Box title="Practice questions" body="Tied to one topic each. Every answer key is confirmed by a second, blind solve before it can count." />
          </div>
          <div className="flex flex-col gap-[1vw]">
            <p className="text-[1.3vw] font-semibold print:text-[13pt]">Tested code decides</p>
            <Box title="Schedule · mastery · insights · limits" body="Prerequisites-first scheduling, Bayesian Knowledge Tracing, the contradiction rule and the plan table import no model — enforced in CI from the import graph." accent />
          </div>
        </div>
      </Slide>

      {/* 4 — walkthrough */}
      <Slide n={4}>
        <H>Five minutes from PDF to “you&apos;re wrong about yourself”.</H>
        <div className="mt-auto mb-[5%] grid grid-cols-5 gap-[1vw]">
          {[
            ["1 Upload", "Any syllabus PDF. A background job shows its real step-by-step progress."],
            ["2 Map", "Tap a topic: what it needs, what it unlocks, and why."],
            ["3 Schedule", "Works back from the deadlines found — or asks for your exam date instead of guessing."],
            ["4 Practise", "Verified questions. Every answer moves a mastery estimate you can see."],
            ["5 Insight", "Marked it done, failing what depends on it? It says so — with the numbers."],
          ].map(([title, body], i) => (
            <Box key={title} title={title} body={body} accent={i === 4} />
          ))}
        </div>
      </Slide>

      {/* 5 — the map */}
      <Slide n={5}>
        <H>The riskiest assumption was tested before any app code.</H>
        <Lead>Does a syllabus contain a dependency graph? It doesn&apos;t — so we checked whether one can be inferred, on real documents, with pass/fail checks.</Lead>
        <div className="mt-auto mb-[4%] grid grid-cols-2 gap-[2vw]">
          <Box title="MIT 18.06 Linear Algebra" body="18 concepts, 24 prerequisite edges. Acyclic, not a chain, a keystone with 14 topics downstream." />
          <Box title="NIT Kurukshetra B.Tech scheme, 23 pages" body="28 concepts, 29 edges across two years of courses — cross-course dependencies included." />
          <Box title="In production, validation is code" body="Dangling edges, self-loops and cycle-closing edges are dropped and counted. Dates are parsed in code; ambiguous ones become “set your exam date”." />
          <Box title="Honest failure states" body="Word file → how to make a PDF. Lecture slides → “not a syllabus”. Busy model → a fallback chain and a retry, never a fake result." />
        </div>
      </Slide>

      {/* 6 — honest mastery */}
      <Slide n={6}>
        <H>A wrong answer key must never contradict a student who was right.</H>
        <div className="mt-auto mb-[4%] grid grid-cols-3 gap-[1.5vw]">
          <Box title="Blind double-solve" body="Questions are generated, options shuffled in code, then a second call answers every one without the key. Only agreement is kept. Spike: 32 of 32 agreed." accent />
          <Box title="Bayesian Knowledge Tracing" body="Corbett & Anderson, 1994. A lucky guess moves the estimate less than knowledge does; one slip doesn't erase a run. No attempts means “not practised”, not 0%." />
          <Box title="A rule that stays quiet" body="Only for topics you marked done. At least 3 answers, at least 60% wrong. Stated as “N of M exam topics depend on this”. Flag a question and it stops counting." />
        </div>
      </Slide>

      {/* 7 — architecture */}
      <Slide n={7}>
        <H>Architecture</H>
        <div className="mt-[3%] grid flex-1 grid-cols-4 gap-[1vw] pb-[5%]">
          <div className="flex flex-col gap-[1vw]">
            <Box title="Next.js 16 on Vercel" body="Server components, route handlers, server actions." />
            <Box title="Better Auth" body="Email + required verification, Google. Session checked on every page." />
          </div>
          <div className="flex flex-col gap-[1vw]">
            <Box title="Tenancy layer" body="The only module holding the database client. Another workspace's record reads as 404." accent />
            <Box title="Neon Postgres + Prisma 7" body="Concepts, edges, questions and attempts are rows, not prose." />
          </div>
          <div className="flex flex-col gap-[1vw]">
            <Box title="Vercel Blob (private)" body="Browser uploads direct; the token is issued only after plan-limit checks." />
            <Box title="Inngest" body="5-step ingest and generate → blind-solve → save jobs; memoised steps, real progress." />
          </div>
          <div className="flex flex-col gap-[1vw]">
            <Box title="Gemini, behind a chain" body="Model fallback with backoff, a content-addressed Postgres cache and a daily call cap." />
            <Box title="Polar (sandbox)" body="Checkout, customer portal, webhooks flip the workspace plan." />
          </div>
        </div>
      </Slide>

      {/* 8 — SaaS */}
      <Slide n={8}>
        <H>A real SaaS, not a demo wearing one.</H>
        <div className="mt-auto mb-[4%] grid grid-cols-3 gap-[1.5vw]">
          <Box
            title={`Free — $0`}
            body={`${PLANS.free.limits.courses} course, ${PLANS.free.limits.documents} documents, ${PLANS.free.limits.checksPerDay} practice questions a day. Map, schedule and insights included.`}
          />
          <Box
            title={`Pro — $${PLANS.pro.priceMonthlyUsd}/month`}
            body="Unlimited courses, documents and practice, plus past papers: exam questions mapped onto the graph, exam weight per topic, marks at risk in insights."
            accent
          />
          <Box title="One plan table" body="Pricing page, usage meters, upgrade prompts and server-side limits all read the same file, so the page can't promise what the code doesn't enforce." />
          <Box title="Workspaces from day one" body="Every row carries a workspace id; a second account gets a 404 on the first's URLs — page and API." />
          <Box title="Try before signing up" body="A view-only demo course (MIT 18.06) for anyone whose verification email lands in spam." />
          <Box title="Abuse-aware" body="Per-plan limits, a service-wide daily model cap, and an honest “at capacity” state instead of a crash." />
        </div>
      </Slide>

      {/* 9 — quality */}
      <Slide n={9}>
        <H>Built to be checked.</H>
        <div className="mt-auto mb-[4%] grid grid-cols-2 gap-[2vw]">
          <Box title="CI on every push" body="verify → test → typecheck → lint → build, on GitHub Actions. Every push to main deploys." />
          <Box title="Invariants from the import graph" body="Only the tenancy layer touches the database. Mastery, schedule, graph and limits never reach a model. Nothing reads the wrong API key." accent />
          <Box title="Tests where it matters" body="Scheduler never puts a topic before its prerequisites and reports lateness; BKT behaves; insights fire only with enough evidence; validators drop cycles; dates refuse to guess." />
          <Box title="Cost discipline" body="Every model answer is cached by content hash. Re-reading the same syllabus, and seeding the demo, cost zero model calls." />
        </div>
      </Slide>

      {/* 10 — next */}
      <Slide n={10} dark>
        <div className="flex flex-1 flex-col justify-center gap-[2.5vw]">
          <h2 className="text-[3.4vw] leading-[1.1] font-semibold tracking-tight print:text-[34pt]">What&apos;s next</h2>
          <ul className="grid max-w-[80%] grid-cols-2 gap-x-[3vw] gap-y-[1vw] text-[1.6vw] text-paper/85 print:text-[16pt]">
            <li>Class plans: a teacher uploads once, a cohort practises</li>
            <li>LMS import (Canvas, Moodle) instead of PDFs</li>
            <li>Lecture slides mapped onto the graph</li>
            <li>Mastery-aware re-planning every morning</li>
          </ul>
          <p className="text-[1.8vw] text-paper print:text-[18pt]">
            Try it now: <span className="font-mono text-accent">syllabus-arrow.vercel.app</span> → “Try the demo course”
          </p>
        </div>
      </Slide>
    </main>
  );
}
