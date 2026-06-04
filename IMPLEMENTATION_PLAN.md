# Whoop Insights — Implementation Plan

Companion to `SPEC.md`. The spec is the *what/why*; this is the *how/when*,
broken into shippable phases. Phase 0 is done; this plan covers Phases 1–3 plus
the cross-cutting concerns that span them.

> Each step lists **Files**, **Approach**, and **Exit criteria**. Steps inside a
> phase are ordered so each one is independently demoable. Keep the layering from
> `CLAUDE.md`: WHOOP API / DB / analytics / UI stay in distinct modules;
> analytics functions are pure and unit-tested; Server Components read the DB
> directly, Client Components only where interactivity demands it.

---

## Current state (post Phase 0)

Built and working:

- `lib/whoop/` — OAuth + refresh (`oauth.ts`), retrying paginated client
  (`client.ts`), zod boundary schemas (`schemas.ts`), idempotent sync engine
  (`sync.ts`), constants.
- `lib/db/` — Drizzle schema (`schema.ts`), client with `snake_case` casing
  (`client.ts`), one query helper (`queries.ts` → `getDataSummary`).
- `app/` — OAuth start/callback + `/api/sync` route handlers; home page showing
  connection state, a **Sync now** button, and row counts.
- `components/ui/` — shadcn primitives (button, card, badge, skeleton).

Not built yet (this plan): `lib/analytics/`, any chart component, the
date-range/tagging/insights UI, profile & body ingestion, automated tests,
deploy/auth/cron.

---

## Cross-cutting (set up early in Phase 1, maintained throughout)

### C1. Testing harness for analytics
- **Files:** `vitest.config.ts`, `package.json` (`test` script), `*.test.ts`
  colocated with each analytics module.
- **Approach:** Vitest (zero-config with TS, fast). Analytics functions are pure
  → table-driven unit tests with fixed fixtures. No DB in unit tests.
- **Exit:** `npm test` runs green; every formula in `SPEC.md` §5 has tests
  covering normal + small-n / empty / NaN-guard cases.

### C2. Analytics types & time-series shape
- **Files:** `lib/analytics/types.ts`.
- **Approach:** Define the canonical row the analytics layer consumes — a
  per-day series `{ day: string (YYYY-MM-DD), value: number | null }` and the
  multi-metric daily frame the queries produce. Decouple analytics from Drizzle
  row shapes so functions stay pure and testable.
- **Exit:** Types compile; query layer (C3) and dashboards both import them.

### C3. Query layer (DB → analytics-ready frames)
- **Files:** `lib/db/queries.ts` (extend).
- **Approach:** Add typed readers that select only needed columns over a date
  range and bucket each record to its **local** day using `tz_offset`
  (date-fns-tz), not UTC. Examples: `getRecoverySeries`, `getSleepSeries`,
  `getStrainSeries`, `getWorkouts`, `getDayTags`, `getEvents`. Index-friendly
  (`start_time`/`day` are indexed). Return `types.ts` frames.
- **Exit:** Each reader returns correct local-day buckets for a known fixture
  range; spot-checked against the WHOOP app for a few days incl. a DST boundary
  (the data spans a `-08:00`→`-07:00` change).

### C4. Add date-fns + date-fns-tz
- **Files:** `package.json`.
- **Approach:** `npm i date-fns date-fns-tz` (spec'd but not yet installed).
- **Exit:** Imported by the query layer and date utilities.

---

## Phase 1 — Core dashboards (exploratory viz)

Goal: open the app and *see* your data — baselines, trends, calendar, sleep,
strain — with a global date range. Depends on C1–C4.

### 1.1 Analytics foundation
- **Files:** `lib/analytics/baseline.ts`, `ewma.ts`, `zscore.ts`, `dates.ts`
  (+ tests).
- **Approach:** Pure functions from `SPEC.md` §5:
  - `rollingBaseline(series, window=30|90)` → mean ± SD trailing window.
  - `zScore(today, {mean, sd})` → flag `|z| ≥ 1.5`.
  - `ewma(series, alpha≈0.2)` → smoothed line, null-gap aware.
  - `dates.ts` — local-day bucketing, range expansion (fill missing days as
    `null`), weekday helpers.
- **Exit:** All unit-tested incl. gaps/short windows; no `any`.

### 1.2 Global date-range + app shell
- **Files:** `app/(dashboard)/layout.tsx`, `components/date-range-picker.tsx`,
  `app/(dashboard)/page.tsx` (move/extend current home), nav.
- **Approach:** Route group for dashboards with a sidebar/tab nav. Date range
  held in the URL (`?from=&to=`) so Server Components can read it and refetch.
  shadcn popover + calendar for the picker (Client Component).
- **Exit:** Changing the range updates every chart via server refetch; default
  range = last 90 days; deep-linkable.

### 1.3 Overview dashboard
- **Files:** `app/(dashboard)/page.tsx`, `components/charts/metric-card.tsx`.
- **Approach:** Recovery / strain / sleep cards: today (or latest) vs 30-day
  baseline, with the z-score band rendered as a small sparkline + badge
  (green/amber by `|z|`). Reuse existing count summary below.
- **Exit:** Cards show value, baseline band, z flag; handle "no data in range".

### 1.4 Recovery calendar heatmap
- **Files:** `components/charts/recovery-calendar.tsx` (d3 + SVG, Client).
- **Approach:** GitHub-style year grid; cell color = recovery score (red→green).
  d3-scale for color; pure SVG render (React-19-safe, no visx). Tooltip on hover;
  click → set date range to that week.
- **Exit:** Full-history calendar renders; colors match recovery; keyboard/hover
  accessible tooltip.

### 1.5 HRV & RHR trend charts
- **Files:** `components/charts/trend-chart.tsx`.
- **Approach:** Recharts line: raw + EWMA overlay + 30-day baseline band
  (shaded area). Shared component parameterized by metric.
- **Exit:** Renders HRV and RHR; EWMA visibly less jumpy; band reflects §5.

### 1.6 Sleep dashboard
- **Files:** `app/(dashboard)/sleep/page.tsx`,
  `lib/analytics/sleep-debt.ts`, `lib/analytics/regularity.ts` (+ tests),
  `components/charts/sleep-stages.tsx`.
- **Approach:** Stacked-area stages (light/SWS/REM/awake from the `*_milli`
  columns); performance/efficiency trend lines; **sleep debt** chart
  (`Σ(need − actual)` trailing 14d); **regularity index** from circular variance
  of bed/wake clock-minutes. Exclude naps where appropriate (`is_nap`).
- **Exit:** Debt & regularity unit-tested; charts render; nap handling explicit.

### 1.7 Strain dashboard
- **Files:** `app/(dashboard)/strain/page.tsx`,
  `components/charts/strain-recovery-scatter.tsx`,
  `components/charts/hr-zone-bar.tsx`.
- **Approach:** Daily strain line; strain-vs-same-day-recovery scatter (flag
  high-strain/low-recovery quadrant); HR-zone mix stacked bar from workout
  `zone0..5_milli`.
- **Exit:** All three render over the selected range; quadrant flagging correct.

### 1.8 Event overlays
- **Files:** `components/charts/event-overlay.tsx`, query in C3.
- **Approach:** Render `events` rows as vertical markers/bands on time-series
  charts (reusable wrapper). (Tagging *UI* is Phase 2; this only reads/overlays.)
- **Exit:** Seeded events appear on trend/strain/sleep charts within range.

**Phase 1 exit criteria:** From a synced DB you can browse Overview, Recovery
calendar, HRV/RHR trends, Sleep, and Strain, all driven by a shared URL date
range, with event overlays. Analytics covered by unit tests.

---

## Phase 2 — Insights / "sports scientist"

Goal: the differentiated value — patterns, comparisons, behavior-driver
analysis, overtraining watch, and a rule-based weekly digest.

### 2.1 Day-of-week patterns
- **Files:** `lib/analytics/day-of-week.ts` (+ tests),
  `app/(dashboard)/patterns/page.tsx`.
- **Approach:** Mean metric per weekday vs overall mean, with `n` and SD per §5.
- **Exit:** View shows per-weekday deltas with n/spread; tested.

### 2.2 Month-over-month / Year-over-year
- **Files:** `lib/analytics/periods.ts` (+ tests),
  `app/(dashboard)/compare/page.tsx`.
- **Approach:** Monthly aggregates; compare to prior month and same month last
  year; small-multiple or grouped bars.
- **Exit:** MoM/YoY render for recovery/strain/sleep; correct calendar bucketing.

### 2.3 Tagging UI + driver analysis
- **Files:** `app/(dashboard)/tags/page.tsx`, `components/tag-editor.tsx`,
  `app/api/tags/route.ts` (+ `events` CRUD),
  `lib/analytics/driver-analysis.ts` (+ tests).
- **Approach:** Per-day tag add/remove (vocab: travel, sick, stress; extensible)
  and event CRUD via route handlers / server actions. Driver analysis: for each
  tag, mean **next-day** recovery & HRV for tagged vs untagged days, delta + n +
  simple effect size; small-n flagged low-confidence in UI.
- **Exit:** Can tag days, see driver deltas with confidence guarding; analysis
  unit-tested incl. n=0 and tiny-n.

### 2.4 Overtraining watch (ACWR)
- **Files:** `lib/analytics/acwr.ts` (+ tests),
  `components/charts/acwr-gauge.tsx`, surfaced on Strain or its own page.
- **Approach:** `acute(7d strain) ÷ chronic(28d avg strain)`; R/A/G by §5 bands
  (sweet spot 0.8–1.3, >1.5 elevated). Overlay HRV-baseline deviation.
- **Exit:** Gauge shows current ACWR + status; tested at band boundaries.

### 2.5 Weekly digest (rule-based)
- **Files:** `lib/insights/digest.ts` (pure rules, + tests),
  `lib/db/queries.ts` (read/write `insights_cache`),
  `app/(dashboard)/digest/page.tsx`, `app/api/digest/route.ts` (generate).
- **Approach:** Deterministic rules over the analytics outputs → a JSON payload
  cached per `week_start`. Rules: recovery trend, sleep-debt direction, ACWR
  status, notable day-of-week effect, strongest recent tag driver, any
  `|z| ≥ 1.5` anomalies. Render as a card stack ("what changed / what to do").
  Designed so an optional LLM prose layer can wrap this later behind a flag.
- **Exit:** Generating a week writes one `insights_cache` row; re-generation is
  idempotent; card stack renders; rule outputs unit-tested against fixtures.

**Phase 2 exit criteria:** Patterns, comparisons, tagging+drivers, ACWR watch,
and a cached weekly digest are all live and tested.

---

## Phase 3 — Deploy-readiness (later)

Only when you decide to move off local. Schema already carries the seam for this.

### 3.1 Profile & body ingestion
- **Files:** `lib/db/schema.ts` (`profile`, `body_measurements` tables),
  `lib/whoop/schemas.ts` + `sync.ts` (fetch `/v2/user/profile/basic`,
  `/v2/user/measurement/body`), migration.
- **Approach:** Persist what §3 lists but Phase 0 skipped. Use max HR for zone
  context; profile for display.
- **Exit:** Both sync idempotently; surfaced where useful (e.g. zone labels).

### 3.2 Auth gate
- **Approach:** Layer Supabase Auth; populate the `user_id` seam already present
  in the schema; scope all queries by user. Additive migration, not a rewrite.
- **Exit:** Authenticated single-user deploy; queries user-scoped.

### 3.3 Vercel deploy + scheduled sync
- **Files:** `vercel.json` or a cron route; `app/api/sync` hardened for serverless.
- **Approach:** Vercel Cron (e.g. daily) hits an authenticated sync endpoint so
  the WHOOP refresh token stays alive and data stays current without a manual
  "Sync now". Add request auth (secret/header) to the sync route.
- **Exit:** Deployed app; nightly sync runs; token auto-refreshes unattended.

### 3.4 Refinements
- Mid-backfill progress indicator (use the `sync_state.cursor` column — present
  but currently unused), loading skeletons, error toasts, empty states.

---

## Suggested build order

1. **C1–C4** (test harness, types, query layer, date-fns) — unblocks everything.
2. **Phase 1** 1.1 → 1.8 — immediate visual payoff.
3. **Phase 2** 2.1 → 2.5 — the differentiated insight value.
4. **Phase 3** — only when deploying.

## Conventions reminder
- No `any`; validate external data with zod at the boundary; let Drizzle infer DB
  types.
- Analytics = pure functions in `lib/analytics/` (and `lib/insights/`), each with
  a colocated `*.test.ts`.
- Day bucketing always uses record `tz_offset`, never UTC.
- Server Components read the DB directly; mutations (tags/events/digest) go
  through route handlers / server actions; secrets never reach the client.
