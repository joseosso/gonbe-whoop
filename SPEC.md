# Whoop Insights — Technical Specification

A personal, local-first web app that syncs your WHOOP data into a Supabase
Postgres database and surfaces the trends, comparisons, and decision-support
insights that the WHOOP app itself doesn't give you.

> Status: **Spec for review.** No application code written yet. This document is
> the contract we agree on before implementation begins.

---

## 1. Goals & non-goals

### Primary goals
- **Sleep optimization** — sleep debt, regularity/consistency, stage trends.
- **Training optimization** — strain vs recovery balance, overtraining warnings
  (ACWR), workload trends. (User does structured/mixed training.)
- **Trends & comparisons** — month-over-month, year-over-year, day-of-week
  effects, personal baselines (not population baselines).
- **Both narrative and exploratory** — a weekly rule-based digest *and* rich
  interactive visualizations.

### Non-goals (for v1)
- No multi-user support, no public deployment, no auth gate (runs locally).
  Schema is designed so Supabase Auth can be layered on later for a Vercel
  deploy without a rewrite.
- No real-time/webhook ingestion in v1 (manual "Sync now" + incremental).
- **Narrative digest is rule-based / deterministic** — no LLM dependency.
  (Designed so an optional LLM prose layer can be added later behind a flag.)

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Next.js (App Router, TypeScript) — runs locally on :3000  │
│                                                            │
│  Route handlers / server actions:                         │
│    /api/auth/whoop        → start OAuth                    │
│    /api/auth/whoop/callback → exchange code, store tokens  │
│    /api/sync              → pull v2 data, upsert to DB     │
│                                                            │
│  Server Components read directly from Postgres (Drizzle)   │
│  Client Components render charts (Recharts / nivo)         │
└───────────────┬─────────────────────────┬──────────────────┘
                │                          │
         WHOOP API v2                Supabase Postgres
        (OAuth 2.0)                  (free tier cache)
```

### Stack decisions
| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 App Router**, TypeScript | Requested; server components read DB directly |
| Styling | **Tailwind CSS + shadcn/ui** | Requested; minimalist modern UI |
| DB access | **Drizzle ORM** (`postgres` driver) | Type-safe analytics queries + migrations |
| DB | **Supabase Postgres** (free tier) | Requested; durable local cache of Whoop data |
| Standard charts | **shadcn charts (Recharts)** | First-class shadcn integration |
| Specialized charts | **nivo** (`@nivo/calendar`, `@nivo/heatmap`) | Calendar heatmap + correlation matrix |
| Dates | **date-fns** + `date-fns-tz` | Timezone-correct day bucketing |
| Validation | **zod** | Validate Whoop API payloads at the boundary |

> Drizzle vs `supabase-js`: we use Drizzle for typed queries and migrations.
> We can still use the Supabase dashboard for inspection. If you'd rather use
> `supabase-js` everywhere, that's a one-line swap in the data layer — flag it.

---

## 3. WHOOP API v2 integration

Base URL: `https://api.prod.whoop.com/developer`

### OAuth 2.0 (Authorization Code flow)
- App registered at the WHOOP developer dashboard → gives **Client ID** +
  **Client Secret** + a registered **redirect URI**
  (`http://localhost:3000/api/auth/whoop/callback` for local).
- Scopes requested:
  `read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline`
  - `offline` is required to receive a **refresh token** for unattended re-sync.
- Tokens stored in the `whoop_tokens` table (single row). Access tokens expire
  (~1 hour); the sync engine refreshes using the refresh token when needed.

### Endpoints we consume (all paginated)
| Resource | Endpoint | Notes |
|---|---|---|
| Cycles | `GET /v2/cycle` | Daily physiological cycle; integer `id` |
| Recovery | `GET /v2/recovery` | One per cycle; keyed by `cycle_id` + `sleep_id` |
| Sleep | `GET /v2/activity/sleep` | **UUID `id`** in v2 (was int in v1) |
| Workouts | `GET /v2/activity/workout` | **UUID `id`** in v2; `sport_id`/name |
| Profile | `GET /v2/user/profile/basic` | name, email, user_id |
| Body | `GET /v2/user/measurement/body` | height, weight, max HR |

### Pagination & filtering
- Query params: `start`, `end` (ISO-8601), `limit` (max 25), `nextToken`.
- Walk pages until the response `next_token` is absent/empty.
- Records carry a `score_state` (`SCORED` / `PENDING_SCORE` / `UNSCORABLE`) and
  may be re-scored later → sync must **upsert** and refresh recent windows.

### Rate limits
- Treat as ~**100 requests/min**, daily cap. Sync uses a small concurrency
  limit + backoff on `429`. Backfill is chunked by date range.

### Key fields we persist (per resource)
- **Cycle**: `start`, `end`, `score.strain`, `score.average_heart_rate`,
  `score.max_heart_rate`, `score.kilojoule`, `timezone_offset`.
- **Recovery**: `score.recovery_score`, `score.resting_heart_rate`,
  `score.hrv_rmssd_milli`, `score.spo2_percentage`, `score.skin_temp_celsius`,
  `user_calibrating`.
- **Sleep**: `score.sleep_performance_percentage`,
  `score.sleep_consistency_percentage`, `score.sleep_efficiency_percentage`,
  `score.respiratory_rate`, `score.sleep_needed.*`, and
  `score.stage_summary.*` (in-bed, awake, light, SWS, REM, no-data millis,
  `disturbance_count`, `sleep_cycle_count`), `nap` flag.
- **Workout**: `sport_id`/name, `score.strain`, `average_heart_rate`,
  `max_heart_rate`, `kilojoule`, `distance_meter`, `altitude_gain_meter`,
  `score.zone_duration.zone_zero..five_milli`.

---

## 4. Database schema (Supabase Postgres)

Drizzle migrations generate this; shown as SQL for review. A `user_id` column is
included everywhere now (defaulted to a single local user) so a future Supabase
Auth deploy is additive, not a migration rewrite.

```sql
-- One row; stores OAuth tokens for unattended re-sync.
create table whoop_tokens (
  id            int primary key default 1,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  updated_at    timestamptz not null default now()
);

create table cycles (
  id            bigint primary key,            -- WHOOP integer cycle id
  start_time    timestamptz not null,
  end_time      timestamptz,
  tz_offset     text,
  strain        double precision,
  avg_hr        int,
  max_hr        int,
  kilojoule     double precision,
  score_state   text,
  raw           jsonb,                         -- full payload for future fields
  updated_at    timestamptz not null default now()
);
create index on cycles (start_time);

create table recoveries (
  cycle_id        bigint primary key references cycles(id),
  sleep_id        uuid,
  recovery_score  int,
  resting_hr      int,
  hrv_rmssd_milli double precision,
  spo2            double precision,
  skin_temp_c     double precision,
  calibrating     boolean,
  score_state     text,
  raw             jsonb,
  updated_at      timestamptz not null default now()
);

create table sleeps (
  id                  uuid primary key,        -- v2 UUID
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  tz_offset           text,
  is_nap              boolean default false,
  performance_pct     double precision,
  consistency_pct     double precision,
  efficiency_pct      double precision,
  respiratory_rate    double precision,
  -- sleep need (millis)
  need_baseline_milli       bigint,
  need_from_debt_milli      bigint,
  need_from_strain_milli    bigint,
  -- stage summary (millis)
  in_bed_milli        bigint,
  awake_milli         bigint,
  light_milli         bigint,
  sws_milli           bigint,                  -- slow-wave (deep)
  rem_milli           bigint,
  no_data_milli       bigint,
  disturbance_count   int,
  sleep_cycle_count   int,
  score_state         text,
  raw                 jsonb,
  updated_at          timestamptz not null default now()
);
create index on sleeps (start_time);
create index on sleeps (is_nap);

create table workouts (
  id                uuid primary key,          -- v2 UUID
  start_time        timestamptz not null,
  end_time          timestamptz not null,
  tz_offset         text,
  sport_id          int,
  sport_name        text,
  strain            double precision,
  avg_hr            int,
  max_hr            int,
  kilojoule         double precision,
  distance_meter    double precision,
  altitude_gain_m   double precision,
  zone0_milli       bigint,  -- HR zone durations
  zone1_milli       bigint,
  zone2_milli       bigint,
  zone3_milli       bigint,
  zone4_milli       bigint,
  zone5_milli       bigint,
  score_state       text,
  raw               jsonb,
  updated_at        timestamptz not null default now()
);
create index on workouts (start_time);
create index on workouts (sport_id);

-- USER-AUTHORED data (the "driver analysis" inputs WHOOP's API can't give us)
create table day_tags (
  id        bigserial primary key,
  day       date not null,
  tag       text not null,        -- e.g. alcohol, late_meal, travel, sick, stress, caffeine_late
  note      text,
  created_at timestamptz not null default now(),
  unique (day, tag)
);
create index on day_tags (day);

create table events (
  id        bigserial primary key,
  start_day date not null,
  end_day   date,                 -- null = single day
  label     text not null,
  type      text,                 -- race | illness | vacation | injury | other
  created_at timestamptz not null default now()
);

-- Sync bookkeeping
create table sync_state (
  resource    text primary key,   -- cycles | recoveries | sleeps | workouts
  last_synced timestamptz,
  cursor      text,               -- last next_token if mid-backfill
  updated_at  timestamptz not null default now()
);

-- Cached weekly narrative digests (rule-based output, JSON for rendering)
create table insights_cache (
  week_start   date primary key,
  payload      jsonb not null,
  generated_at timestamptz not null default now()
);
```

Design notes:
- `raw jsonb` on every Whoop table future-proofs against new fields without a
  migration.
- All durations kept in **millis** (as WHOOP returns); formatted in the UI.
- Day bucketing uses each record's `tz_offset` so "a day" matches what you see
  in the WHOOP app, not UTC.

---

## 5. Analytics — formulas & definitions

These are the deterministic computations behind both the dashboards and the
rule-based digest.

| Metric | Definition |
|---|---|
| **Personal baseline** | Rolling mean ± SD over trailing 30 / 90 days, per metric. |
| **Z-score / "is this real?"** | `(today − baseline_mean) / baseline_sd`. \|z\|≥1.5 flagged as meaningful. |
| **HRV / RHR trend** | EWMA (α≈0.2) overlaid on raw; less jumpy than SMA. |
| **Sleep debt** | `Σ (sleep_need − actual_sleep)` over trailing 14 days (need = baseline+debt+strain components). |
| **Sleep regularity index** | From variance of bed-time & wake-time (clock-minutes, circular); lower variance = higher score. |
| **Day-of-week effect** | Mean metric per weekday vs overall mean, with n and SD. |
| **ACWR (overtraining)** | `acute (7-day strain load) ÷ chronic (28-day avg strain load)`. Sweet spot ≈ 0.8–1.3; >1.5 = elevated risk (amber/red). |
| **Strain–recovery balance** | Daily strain plotted against same-day recovery; flags high-strain-on-low-recovery days. |
| **Driver analysis** | For each tag: mean next-day recovery & HRV for tagged vs untagged days, delta + n (+ simple effect size). Small-n guarded in UI. |
| **MoM / YoY** | Aggregate (mean) per calendar month; compare to prior month and same month last year. |

> Statistical honesty: every comparison surfaces **n** and spread. We avoid
> over-claiming on small samples (e.g. a tag seen 3 times is shown but flagged
> low-confidence).

---

## 6. Feature & UI breakdown (phased)

### Phase 0 — Foundation
- Scaffold Next.js + Tailwind + shadcn; Supabase project + Drizzle schema/migrations.
- WHOOP OAuth (connect screen → callback → token store) + refresh logic.
- Sync engine: full backfill → incremental; re-sync trailing ~7 days to catch
  re-scores. "Sync now" button + last-synced + progress indicator.
- **Exit criteria:** full Whoop history present in Postgres, re-runnable idempotently.

### Phase 1 — Core dashboards (exploratory viz)
- **Overview**: recovery / strain / sleep cards vs 30-day baseline with z-score band.
- **Recovery calendar heatmap** (`@nivo/calendar`, color = recovery).
- **HRV & RHR trends**: raw + EWMA + 30-day band.
- **Sleep dashboard**: stacked-area stages, performance/efficiency trends,
  **sleep debt** chart, **regularity** score.
- **Strain dashboard**: daily strain, strain-vs-recovery scatter, HR-zone mix.
- Global **date-range picker** + **event overlays** on time-series charts.

### Phase 2 — Insights / "sports scientist"
- **Day-of-week** pattern view.
- **MoM / YoY** comparison view.
- **Tagging UI** (per-day tags + events) → **driver analysis** view.
- **Overtraining watch**: ACWR gauge + HRV-baseline deviation, R/A/G status.
- **Weekly digest** (rule-based): generates `insights_cache` rows; renders a
  readable "what changed / what to do" card stack. Rules cover: recovery trend,
  sleep debt direction, ACWR status, notable day-of-week effect, strongest
  recent tag driver, any \|z\|≥1.5 anomalies.

### Phase 3 — Deploy-readiness (later)
- Supabase Auth gate, Vercel deploy, scheduled sync (cron), refinements.

---

## 7. Environment variables (`.env.local`)

```
# WHOOP OAuth app
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=http://localhost:3000/api/auth/whoop/callback

# Supabase Postgres (connection string from project settings → Database)
DATABASE_URL=postgres://...   # used by Drizzle
# (optional, if we also use supabase-js for the dashboard/inspection)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`.env.local` is gitignored. Secrets never committed.

---

## 8. Setup steps (what you'll do once)

1. Create a free **Supabase** project → copy `DATABASE_URL`.
2. Create a **WHOOP developer app** → set redirect URI to the local callback →
   copy Client ID/Secret. Request the scopes in §3.
3. `npm install`, fill `.env.local`, run `npm run db:push` (Drizzle migrate).
4. `npm run dev`, open `:3000`, click **Connect WHOOP**, authorize.
5. Click **Sync now** → backfill runs → dashboards populate.

---

## 9. Open questions / things to confirm during build
- **Drizzle vs `supabase-js`** as the primary data layer (spec assumes Drizzle).
- **nivo vs visx** for the calendar heatmap & correlation matrix (spec assumes nivo).
- Initial **tag vocabulary** for `day_tags` (alcohol, late_meal, caffeine_late,
  travel, sick, stress, …) — easy to extend; what set do you want on day one?
- Backfill depth: all available history (default) vs a bounded window.

---

## 10. Proposed build order
1. Phase 0 foundation (scaffold + OAuth + schema + sync) — gets your data local.
2. Phase 1 dashboards — immediate visual payoff.
3. Phase 2 insights + digest — the differentiated value.
4. Phase 3 — only when you decide to deploy.
```
