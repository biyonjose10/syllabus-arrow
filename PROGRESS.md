# Syllabus→ — progress log

AI Builders Hackathon 2026. One cash prize: **$4,000, Best SaaS Product**.
Deadline **Sept 15, 11:00 PM EDT**. Target submission **Sept 15, 6:00 PM IST**.

**Live:** https://syllabus-arrow.vercel.app

---

## Start here — where we stopped (Sept 14)

**Every gate's code is built, deployed and CI-green** (`d0fd3dc` Gate 3, `5c8ff99` Gate 4, `0c01503` +
`445a3e6` Gate 5).

**Verified on the live site, end to end (Sept 14, headless Chrome as a verified test account):**
sign in → onboarding (course, exam date) → upload MIT 18.06 syllabus PDF → five processing steps, done in
33 s on `gemini-3.6-flash` → 24 topics, 27 edges, nothing dropped by validation → 3 assessments (no dates in
the PDF) → 96 schedule items from the exam date, none late → practice questions written and blind-verified
(first batch 30 of 30 agreed) → a question answered with feedback. The demo course (`/api/demo`) signs in,
and its insight renders: "You marked Linear Systems and Gaussian Elimination done — but 5 of 6 answers on
topics that need it were wrong … 15 of 18 examined topics depend on it."

### Still needs a human

1. **Google sign-in:** OAuth client id + secret (redirect `https://syllabus-arrow.vercel.app/api/auth/callback/google`), then Publish app.
2. **Polar sandbox:** access token, "Pro" product id, webhook secret (endpoint `https://syllabus-arrow.vercel.app/api/auth/polar/webhooks`).
   Until set, the pricing page says "Checkout opens soon".
3. **Gate 0 phone test** with a real inbox (verification email from monkeswag69@gmail.com).
4. **Devpost:** submit using `docs/devpost.md`, the video, and the deck printed from `/deck`.

### Operational notes

- Demo course: `npx tsx prisma/seed.mts` (needs `DEMO_USER_PASSWORD`), zero model calls.
- After a deploy that adds an Inngest function: `curl -X PUT https://syllabus-arrow.vercel.app/api/inngest`.

## Earlier — Sept 13

**The live site is up** (home/sign-up/sign-in 200, dashboard 307 to sign-in, status API 401).
Gates 1+2 code is written, committed (`efa8851`) and CI green. Nothing has been tested end to end yet.

Done Sept 13: Neon (`--plan free_v3`), all tables pushed; private Blob store `syllabus-arrow-blob`;
`GMAIL_APP_PASSWORD` in prod + preview; Gates 1+2 (model chain + Postgres cache + daily cap, 5-step
Inngest ingest, validator, date parser, scheduler, course / map / schedule pages).

Fixed Sept 13: every page was 500 because `BETTER_AUTH_URL` (set Sept 11 from PowerShell) started with
a BOM. `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `SYLLABUS_GEMINI_KEY` were re-added from Git Bash.
**Set env values from Bash only.**

### Next, in order

1. **Human:** decide the sender address for verification email — personal Gmail, a separate Gmail
   made for the app, or a domain + Resend. Then set `GMAIL_USER` (+ matching app password).
2. **Human:** accept Inngest's marketplace terms, then
   `npx vercel integration add inngest --name syllabus-arrow-inngest`. Until then uploads fail with
   `WORKER_UNAVAILABLE`.
3. End-to-end on the live URL: upload MIT 18.06 → steps progress → map renders → schedule. NIT scheme →
   no-dates state. A .docx → PDF-only message.
4. **Gate 0 phone test:** sign up → verification email → "0 of 1 courses" → Free limit on course 2 →
   a second account sees nothing of the first.
5. Remaining setup: Google OAuth client (publish the app), Polar sandbox "Pro" $8/month + token,
   Tin Computer credits, Devpost draft.
6. Gate 3 (checks → BKT → insight, past papers), Gate 4, Gate 5.

### Gates

| Gate | Date | Pass | Status |
|---|---|---|---|
| 0 | Sept 11 | live URL, email sign-up + verification, empty dashboard, tenancy isolation, answer-key spike | code done, spike PASS, **blocked on Neon + Gmail** |
| 1+2 | Sept 12 | upload → job → graph rendered → schedule; honest no-dates / wrong-format states | not started |
| 3 | Sept 13 | checks → BKT mastery → "you're wrong about yourself"; past-paper exam weighting | not started |
| 4 | Sept 14 | limits enforced, pricing, Polar checkout, onboarding, Google sign-in, demo button | not started |
| 5 | Sept 15 | deck, video, README, Devpost submitted by 6 PM IST | not started |

---

## Day 1 — Sept 11

### Spike: does a syllabus contain a dependency graph? — **PASS**

The riskiest assumption in the project, answered before any app code. A syllabus
lists *weeks*, not prerequisites, so the edges have to be inferred from domain
knowledge rather than extracted. If the model had returned a chain of weeks with
arrows on it, the graph, the schedule and the mastery insight would all have
been built on sand.

Run against two real documents — an MIT 18.06 professor's PDF and a 23-page
NIT Kurukshetra B.Tech AI/ML scheme.

| Check | MIT 18.06 | NIT KKR AI/ML |
|---|---|---|
| acyclic | PASS | PASS |
| not a chain (max in-degree > 1) | PASS — 2, with 9 multi-parent nodes | PASS — 3, with 8 multi-parent nodes |
| has depth (downstream ≥ 3) | PASS — 14 | PASS — 7 |
| edge density ≥ 1/concept | PASS — 1.33 | PASS — 1.04 |
| concepts / edges | 18 / 24 | 28 / 29 |
| latency | 12.4s | 22.8s |
| tokens (in/out) | 943 / 2,517 | 13,723 / 3,977 |

The arithmetic checks are necessary but not sufficient; the real test was reading
the rationales. They are dependency claims, not ordering claims:

- *Determinants → Eigenvalues*: "finding eigenvalues requires the roots of the
  characteristic polynomial det(A − λI) = 0"
- *Symmetric matrices → SVD*: "SVD is derived from the spectral decomposition of
  AᵀA and AAᵀ"
- **Multivariable calculus → Backpropagation**: "deriving backpropagation
  requires the multivariable calculus chain rule to propagate partial derivatives
  of loss with respect to all layer parameters"

That last one spans first-year calculus to a much later AI course in a 23-page
program scheme. No calendar ordering could produce it. It is the demo.

**Decision: single-pass extraction holds. The two-pass fallback is not needed.**

Incidental findings:
- The NIT document yielded **0 assessments** — it is a program scheme with no
  dates anywhere. A real "course with no dates" fixture for the honest empty state.
- Gemini reads PDFs natively via `inlineData`. No `pdf-parse` / OCR branch needed,
  which also handles scanned syllabi.

### Plan approved

**Decisions:** Polar sandbox (Stripe is invite-only for new Indian businesses) ·
Gmail SMTP app password for verification email (Resend needs an owned domain to
reach strangers) · cut slides before past papers · demo course MIT 18.06 ·
Free (1 course, 10 documents, 20 checks/day) + Pro $8/mo · "Try the demo course"
and Continue with Google on the landing page. Gates 1 and 2 merged, because one
extraction call already returns concepts, edges and assessments.

### Gate 0 — code

Green: `verify` 3/3 invariants · `test` 14/14 · `typecheck` · `lint` · `build` · CI on GitHub.

- Better Auth: email + password with **required** verification over Gmail SMTP; Google sign-in shown
  only when its credentials exist; sign-in tells "wrong password" apart from "not confirmed yet" and
  offers a resend.
- A workspace per user from the user-create hook, self-healed by `requireWorkspace()`.
- `src/lib/tenancy.ts` is the only holder of the raw Prisma client; branded `WorkspaceContext`;
  other workspaces' records read as `null` → 404.
- `src/lib/plans.ts` — one plan table for pricing and enforcement. Dashboard shows "0 of 1 courses";
  a second course on Free returns the limit message.
- Full product schema (graph, assessments, past papers, BKT mastery, self-reports, schedule, billing,
  usage, model cache) with `workspaceId` on every product table.
- `scripts/verify.mts`: tenancy / no model in decisions / no `GEMINI_API_KEY`. It caught
  `spike-graph.ts` still reading that variable — fixed.

Found on the way: `next/font/google` fails the build offline → system fonts · Better Auth touches the
Prisma client at import, so a DB-less build logs a harmless `DATABASE_URL is not set` · `vitest@5`
needs `@types/node@22`.

### Spike: can the model write practice questions with correct keys? — **PASS**

`scripts/spike-checks.ts` on the cached MIT 18.06 graph: 4 questions × the 8 concepts with the largest
downstream sets, options shuffled in code, a second call answers blind.

| Check | Result |
|---|---|
| generated / malformed | 32 / 0 |
| concept ids valid | 32 / 32 |
| blind agreement | **32 / 32 (100%)** |
| top-5 coverage | every concept kept 4 |

The 10 printed questions were checked by hand (Gaussian elimination, RREF, inconsistency in k, the four
fundamental subspaces, a 2×2 and a block inverse) — all ten keys correct. Caveat: generator and solver
were the same model, so errors could correlate; the product keeps the blind double-solve AND a
"this question is wrong" flag that removes a question from mastery.

**Model availability is a product requirement.** On the free key the same hour:
- `gemini-3.8-flash` and `gemini-3.7-flash`: 503 "high demand" on every real-sized request (a one-word
  request to 3.7 still succeeded — load shedding, not refusal), and 3.7 then hit **429 quota exhausted**.
- `gemini-3.6-flash`: served both calls (109s generate, 44s solve). `gemini-3.5-flash` answered a probe.
- `gemini-2.5-flash`: refused outright on this key.

So the model provider gets a chain with backoff that honours Google's `retryDelay` and records which
model answered.

### Deployed

- Vercel project `syllabus-arrow`, Git-connected (every push to `main` deploys), Deployment Protection off.
- Env vars set: `BETTER_AUTH_SECRET`, `SYLLABUS_GEMINI_KEY` (production + preview), `BETTER_AUTH_URL`
  (production).
- `vercel link` appended a `.env*` rule to `.gitignore` that re-ignored `.env.example` — removed.
- Neon install stopped at `integration_terms_acceptance_required` → see "Start here".
