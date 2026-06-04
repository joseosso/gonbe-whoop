# Whoop Insights

A local-first Next.js app that syncs your WHOOP data into Supabase Postgres and
surfaces the trends, comparisons, and decision-support insights the WHOOP app
doesn't give you — across sleep, training, and recovery.

See **[`SPEC.md`](./SPEC.md)** for the full architecture, data model, analytics,
and roadmap, and **[`CLAUDE.md`](./CLAUDE.md)** for coding standards.

## Stack

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · Drizzle ORM
(Supabase Postgres) · Recharts + d3 · WHOOP API v2 (OAuth 2.0).

## Setup

1. Create a free **Supabase** project and copy its `DATABASE_URL`
   (Settings → Database).
2. Create a **WHOOP developer app** and set the redirect URI to
   `http://localhost:3000/api/auth/whoop/callback`.
3. `cp .env.example .env.local` and fill in the values.
4. Install and migrate:
   ```bash
   npm install
   npm run db:push
   ```
5. Run it:
   ```bash
   npm run dev
   ```
6. Open <http://localhost:3000>, click **Connect WHOOP**, authorize, then
   **Sync now** to backfill your history.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run db:generate` | Generate SQL migrations from the schema |
| `npm run db:push` | Apply the schema to the database |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run lint` | ESLint |
