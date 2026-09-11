@AGENTS.md

# Syllabus→ — operational notes

Hackathon SaaS entry: upload a syllabus → prerequisite graph → schedule → mastery checks that can
contradict what the student marked done. **Live: https://syllabus-arrow.vercel.app.**

**On resume, read `PROGRESS.md` → "Start here" first.** It says exactly what is blocked and what is next.

## The one idea the code protects

The model writes the map and the questions; **code decides** mastery, the schedule, the insights and
plan limits. `npm run verify` enforces three invariants from the import graph:

1. Only `src/lib/tenancy.ts` (and Better Auth's adapter in `src/lib/auth.ts`) import the raw Prisma
   client. Everything else passes a `WorkspaceContext`. Another workspace's record reads as `null` → 404.
2. `src/lib/{mastery,schedule,graph}/**` and `src/lib/plans.ts` never reach `@google/genai` or
   `src/lib/llm`, even transitively.
3. Nothing reads `process.env.GEMINI_API_KEY`. The Gemini key is **`SYLLABUS_GEMINI_KEY`** — on the dev
   machine `GEMINI_API_KEY` is an inherited variable holding a different, paid key, and Next checks
   `process.env` before `.env.local`, so it would silently win.

## Commands

```
npm run dev          npm run build        npm run lint
npm run typecheck    npm test             npm run verify
npm run db:push      npm run spike:graph  npm run spike:checks
```

`typecheck` runs `next typegen` first (route type helpers only exist after it).

## Deploys

Vercel project `syllabus-arrow`, **Git-connected: every push to `main` deploys.** Deployment Protection
is disabled so judges need no login. Env vars live in Vercel (names in `.env.example`); set them with
`vercel env add NAME production` piping the value in, never by committing.

## Traps

- **Run Vercel CLI commands one at a time.** Two concurrent `npx vercel@latest` runs corrupt the npx cache.
- **`vercel link` appends to `.env.local` and `.gitignore`**, and `vercel env pull` overwrites
  `.env.local`. Pull into a different file and copy what you need.
- **Marketplace installs (Neon, Inngest) need a human to accept terms in the browser** — the CLI stops
  with `integration_terms_acceptance_required` and a URL.
- **Gemini models shed load.** On the free key, 3.8-flash and 3.7-flash returned 503 on real-sized
  requests while 3.6-flash served them. Every model call goes through a model chain with backoff that
  honours `retryDelay` — never a single hard-coded model.
- `next/font/google` downloads at build time and fails offline → system font stack in `globals.css`.
- Prisma 7 needs `@prisma/adapter-pg`; stay on `7.10.0` (`prisma@latest` is an 8.0 RC).
- Better Auth touches the lazy Prisma client at import, so a build with no database logs
  `DATABASE_URL is not set`. Harmless; CI sets a placeholder URL.
- `vitest@5` needs `@types/node@22`.
- `proxy.ts` (Next 16's renamed middleware) is a cookie-presence redirect only — never the auth boundary.
  Pages and actions call `requireWorkspace()`.
