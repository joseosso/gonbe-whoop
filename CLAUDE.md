# CLAUDE.md

## Project

**Whoop Insights** — a local-first Next.js app that syncs personal WHOOP data
into a Supabase Postgres cache and surfaces trends, comparisons, and
decision-support insights (sleep, training, recovery) that the WHOOP app omits.
See `SPEC.md` for the full architecture, data model, and roadmap.

Stack: Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · Drizzle ORM
(Supabase Postgres) · Recharts + d3 · WHOOP API v2 (OAuth 2.0).

## Coding standards

- **Clean, simple, modular, easy to read.** Prefer small focused modules and
  pure functions; avoid premature abstraction and cleverness.
- **Latest library versions + modern features.** React Server Components by
  default; Client Components only when interactivity requires it. Use modern
  language/runtime features over legacy patterns.
- **Type-safe end to end.** No `any`. Validate all external data (WHOOP API
  responses) with zod at the boundary; let Drizzle infer DB types.
- **Separation of concerns.** Keep WHOOP API, DB access, analytics, and UI in
  distinct layers. Analytics functions are pure and unit-testable.
- **Server-first data access.** Server Components read the DB directly; mutations
  go through route handlers / server actions. Never expose secrets to the client.
- **Consistent style.** Follow ESLint/Prettier defaults; descriptive names;
  comments only where intent isn't obvious from the code.
- **Secrets** live in `.env.local` (gitignored) — never commit credentials.

## Layout

- `app/` — routes, layouts, server components
- `lib/whoop/` — WHOOP API client + OAuth
- `lib/db/` — Drizzle schema, client, queries
- `lib/analytics/` — pure analytic functions (baselines, ACWR, sleep debt, …)
- `components/` — UI (shadcn + charts)

## Commands

- `npm run dev` — local dev server
- `npm run db:generate` / `npm run db:push` — Drizzle migrations
- `npm run lint` · `npm run build`
