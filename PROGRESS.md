# Syllabus→ — progress log

AI Builders Hackathon 2026. One cash prize: **$4,000, Best SaaS Product**.
Deadline **Sept 15, 11:00 PM EDT**. Target submission **Sept 15, 6:00 PM IST**.

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

### Incidental findings

- The NIT document yielded **0 assessments** — it is a program scheme with no
  dates anywhere. This is a real "course with no dates" fixture for the honest
  empty state, rather than a synthetic one we invent on Day 4.
- Gemini reads PDFs natively via `inlineData`, verified against the installed
  SDK types. No `pdf-parse` / OCR branch needed — which removes a dependency and
  handles scanned syllabi for free.
- `C:\Users\biyon` is itself a git repo. This project has its own repo so the two
  never entangle.

### Done
- [x] Spike written, cached, and passing on two real documents
- [x] Next 16.3.4 + TS + Tailwind v4 scaffolded
- [x] `@google/genai` + `tsx` installed; SDK surface verified by introspection
- [x] Disk cache built on Day 1 rather than Day 2 — re-runs cost zero tokens
- [x] Standalone git repo, `.gitignore` covering `.cache/` and every `.env` shape

### Open
- [ ] ⏰ Tin Computer credits ($299, first 100 teams)
- [ ] Neon Postgres → `DATABASE_URL`
- [ ] New Google Cloud project → OAuth client + a **new** Gemini key
- [ ] Stripe test mode → Product/Price
- [ ] Prisma schema, Auth.js, tenancy, deploy to Vercel

### Plan approved (session 2, Sept 11)

Full plan: `~/.claude/plans/you-are-my-technical-toasty-reddy.md`.

**Decisions:** Polar sandbox (Stripe is invite-only for new Indian businesses) ·
Gmail SMTP app password for verification email (Resend needs an owned domain to
reach strangers) · new free-tier Gemini key in a new GCP project, no billing ·
cut slides before past papers · demo course MIT 18.06 · Free + Pro $8/mo ·
"Try the demo course" + Continue with Google on the landing page.

**Gates re-dated** (we started a day late; one extraction call already returns
concepts, edges and assessments, so Gates 1 and 2 merge):

| Gate | Date | Pass |
|---|---|---|
| 0 | Sept 11 | live URL, email sign-up + verification, empty dashboard, tenancy isolation, answer-key spike passes |
| 1+2 | Sept 12 | upload → job → graph rendered → schedule; honest no-dates / wrong-format states |
| 3 | Sept 13 | checks → BKT mastery → "you're wrong about yourself"; past-paper exam weighting |
| 4 | Sept 14 | limits enforced, pricing, Polar checkout, onboarding, Google sign-in, demo button |
| 5 | Sept 15 | deck, video, README, Devpost submitted by 6 PM IST |

**Env-var trap:** the Windows user environment already has `GEMINI_API_KEY`
(the shared paid key), and Next never lets `.env.local` override an existing
process variable. The app therefore reads `SYLLABUS_GEMINI_KEY` only.

### Note on the API key
The spike ran on the `GEMINI_API_KEY` already present in the user's User-scope
environment variables — the shared FairLens/KSP/Crucible key, not a new one.
Three calls, ~16k in / ~7k out total. It must be replaced with a key from a new
Google Cloud project; the shared key has a service-account binding and is never
to be deleted or rotated in place.
