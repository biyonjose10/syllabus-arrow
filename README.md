# Syllabus→

**A term plan that knows what you can't do yet — including the things you think you can.**

Upload a syllabus PDF. Syllabus→ infers the prerequisite map the syllabus never states, builds a schedule that
works back from your deadlines, and gives you verified practice that tracks what you actually know. Mark a
topic done and keep failing the topics built on it, and it tells you — with the numbers.

- **Live:** https://syllabus-arrow.vercel.app — press **Try the demo course** to explore without an account
- **Pitch deck:** https://syllabus-arrow.vercel.app/deck
- Built for the AI Builders Hackathon 2026 (Best SaaS Product)

## The idea the code protects

> **The model writes the map and the questions; code decides what you know.**

| AI writes | Tested code decides |
|---|---|
| Concepts and prerequisite edges, each with a reason | Graph validity (dangling / self / cycle-closing edges dropped) |
| Practice questions with a proposed answer key | Whether the key is trusted — a second, blind solve must agree |
| Which topic each past-paper question tests | Exam weight per topic (share of marks) |
| | The schedule, mastery (Bayesian Knowledge Tracing), insights, plan limits |

`npm run verify` enforces this from the import graph in CI: the scheduler, mastery model, graph algorithms and
plan limits can never import a model client, even transitively.

## What it does

1. **Upload** a syllabus PDF straight to private storage. A background job reads it in five real steps.
2. **Map** — an interactive prerequisite graph. Tap a topic: what it needs, what it unlocks, and why.
3. **Schedule** — prerequisites first, working back from assessment dates; spaced reviews in leftover time;
   lateness reported, never hidden. No usable dates → it asks for your exam date instead of guessing.
4. **Practise** — questions whose keys survived a blind double-solve. Each answer updates a BKT mastery estimate.
   "This question is wrong" removes it and replays your mastery without it.
5. **Insights** — for topics you marked done: at least 3 answers and ≥ 60 % wrong (on it, or on topics that need
   it) → "You marked X done, but 5 of 6 answers on topics that need it were wrong. 15 of 18 exam topics depend on it."
6. **Pro** ($8/month, Polar sandbox checkout) — unlimited courses and practice, and **past papers**: exam
   questions mapped onto the graph so topics carrying more marks come first and insights show marks at risk.

Honest states everywhere: a `.docx` gets instructions for making a PDF; lecture slides get "not a syllabus";
a busy model falls back through a chain and retries; the daily model budget running out says so and points to the demo.

## Stack

Next.js 16 · TypeScript · Vercel · Better Auth (email verification, Google) · Neon Postgres + Prisma 7 ·
Vercel Blob (private) · Inngest · Gemini via `@google/genai` · Polar · React Flow + dagre · Zod · Vitest ·
Tailwind 4. See [`docs/architecture.md`](docs/architecture.md).

## Evidence, not claims

- **Graph spike** (`scripts/spike-graph.ts`) on real syllabi before any app code: MIT 18.06 → 18 concepts,
  24 edges, acyclic, not a chain, keystone with 14 dependents; a 23-page NIT Kurukshetra scheme → 28 / 29.
- **Answer-key spike** (`scripts/spike-checks.ts`): 32 generated questions, 32 of 32 matched by a blind solve.
- **Tests** (`npm test`): scheduler never places a topic before a prerequisite and reports lateness; BKT rises,
  falls, resists guesses and slips; insights fire only with enough evidence; validators drop cycles; the date
  parser refuses ambiguous dates; past-paper marks split correctly.
- **CI**: verify → test → typecheck → lint → build on every push.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in values; see comments in the file
npm run db:push              # create tables
npx prisma db seed           # optional: the demo course (needs DEMO_USER_PASSWORD)
npx inngest-cli@latest dev   # background jobs, in a second terminal (set INNGEST_DEV=1)
npm run dev
```

```bash
npm run verify     # structural invariants
npm test           # unit tests
npm run typecheck && npm run lint && npm run build
```

The Gemini key is read from `SYLLABUS_GEMINI_KEY`, deliberately not `GEMINI_API_KEY`.

## Project layout

```
src/lib/tenancy.ts          the only module that queries product tables; every call is workspace-scoped
src/lib/ingest/             extraction prompt, validator, past-paper matcher, the ingest job
src/lib/checks/             question prompts, blind double-solve, the generate-checks job
src/lib/llm/                provider interface, Gemini model chain, Postgres cache + daily cap
src/lib/schedule/           date parser, scheduler, exam weights, rebuild
src/lib/mastery/            BKT, insight rule, question picker
src/lib/graph/algorithms.ts topological sort, ancestors, downstream
src/lib/plans.ts            the plan table every limit and the pricing page read
scripts/verify.mts          import-graph invariants
prisma/seed.mts             the demo course, from cached spike data (zero model calls)
```
