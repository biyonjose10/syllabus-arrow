# Syllabus→ — Devpost submission

**Tagline:** A term plan that knows what you can't do yet — including the things you think you can.

**Try it:** https://syllabus-arrow.vercel.app → *Try the demo course* (no account needed)
**Code:** https://github.com/biyonjose10/syllabus-arrow
**Deck:** https://syllabus-arrow.vercel.app/deck

## Inspiration

Every student gets a syllabus in week one and a panic in week eleven. A syllabus says *when* topics are
taught. It never says what depends on what, so students plan by the calendar, tick topics "done" after
reading them, and discover the shaky foundation when the exam does.

## What it does

1. **Upload a syllabus PDF.** A background job reads it and shows its real progress, step by step.
2. **Get the prerequisite map.** An interactive graph of concepts. Every arrow carries the reason one idea
   can't be learned without the other. These links are inferred, because no syllabus states them.
3. **Get a schedule.** Prerequisites first, working back from the deadlines found in the document, with spaced
   reviews. If the syllabus has no usable dates, it asks for your exam date instead of inventing one. If time
   runs out, it says which topics will be late.
4. **Practise.** Multiple-choice questions for each topic, where each answer key was confirmed by a second,
   blind solve. Each answer updates a Bayesian Knowledge Tracing mastery estimate.
5. **Be told when you're wrong about yourself.** Mark a topic done and keep failing the topics built on it,
   and Syllabus→ says so, with evidence: "You marked Gaussian elimination done, but 5 of 6 answers on topics
   that need it were wrong. 15 of 18 exam topics depend on it."
6. **Pro ($8/month).** Unlimited courses and practice, plus **past papers**: exam questions are mapped onto the
   graph, so topics carrying more marks come first and insights show the marks at risk.

It's a SaaS product rather than a demo: email sign-up with verification, workspaces with a tested tenancy
boundary, plan limits enforced from one table, Polar checkout (sandbox — card 4242 4242 4242 4242), a billing
page, onboarding, and a view-only demo course for anyone whose verification email lands in spam.

## How we built it

**The rule: the model writes the map and the questions; code decides what you know.**

- **AI (Gemini)** does the two jobs that need subject knowledge: inferring prerequisite edges, and writing
  practice questions.
- **Tested TypeScript** does everything that judges a student: graph validation, date parsing, the scheduler,
  Bayesian Knowledge Tracing, the insight rule, and plan limits.
- A CI script walks the import graph and fails the build if any decision module can reach a model client.

We tested the riskiest assumption before writing app code. A spike ran the extraction on MIT 18.06 and on a
23-page Indian engineering scheme, with pass/fail checks: acyclic, not a chain, real depth, rationales about
understanding rather than ordering. A second spike tested answer keys: 32 generated questions, and a blind solve
agreed on all 32. That blind double-solve is now part of the production pipeline.

**Stack:**
- **App:** Next.js 16 on Vercel
- **Accounts:** Better Auth, with Gmail SMTP for verification email
- **Data:** Neon Postgres + Prisma 7, and private Vercel Blob storage for PDFs, uploaded straight from the browser
- **Background jobs:** Inngest runs memoised 5-step jobs with real progress
- **Model calls:** a Gemini model chain with backoff, a content-addressed Postgres cache, and a service-wide daily cap
- **Payments:** Polar sandbox
- **Interface:** React Flow + dagre, Zod, Tailwind
- **Tests:** Vitest, on GitHub Actions

## Challenges we ran into

- **Load shedding:** free-tier models dropped real-sized requests with 503s while tiny requests passed. So
  every call goes through a model chain that honours `retryDelay`. When all models are busy, the job step asks
  Inngest to retry later instead of failing the upload.
- **Payments from India:** Stripe accounts are invite-only for new Indian businesses, so we moved to Polar.
  Free email senders only deliver to your own inbox without a domain, so we used Gmail SMTP.
- **Real syllabi are messy:** "Week 6", "TBA", "03/04". The date parser refuses to guess an ambiguous date,
  because a wrong exam date produces a schedule that is confidently wrong.
- **Contradicting a student has to be earned:** one wrong answer key would make the product contradict a student
  who was right. Hence the blind double-solve, the "this question is wrong" flag, and the evidence thresholds.

## Accomplishments we're proud of

- The insight is honest by construction. It only speaks about claims the student made, on verified questions,
  once there's enough evidence.
- Tenancy and "no model in decisions" are enforced by CI, not by convention.
- The demo course costs zero model calls: it's seeded from the cached spike runs.

## What we learned

A syllabus is a calendar. The prerequisite structure students need is real, but it has to be inferred, and it
has to be checked by code before anyone relies on it.

## What's next

- Class plans, where a teacher uploads once and a cohort practises
- LMS import instead of PDFs
- Lecture slides mapped onto the graph
- Mastery-aware re-planning every morning

## Built with

nextjs · typescript · vercel · better-auth · postgresql · neon · prisma · inngest · gemini · vercel-blob ·
polar · react-flow · dagre · zod · vitest · tailwindcss
