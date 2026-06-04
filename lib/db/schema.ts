import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name?: string) =>
  name
    ? timestamp(name, { withTimezone: true })
    : timestamp({ withTimezone: true });
const updatedAt = () => ts().notNull().defaultNow();

/** OAuth tokens for unattended re-sync. Single row (id = 1). */
export const whoopTokens = pgTable("whoop_tokens", {
  id: integer().primaryKey().default(1),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: ts().notNull(),
  scope: text(),
  updatedAt: updatedAt(),
});

/** Daily physiological cycle. */
export const cycles = pgTable(
  "cycles",
  {
    id: bigint({ mode: "number" }).primaryKey(), // WHOOP integer cycle id
    startTime: ts().notNull(),
    endTime: ts(),
    tzOffset: text("tz_offset"),
    strain: doublePrecision(),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    kilojoule: doublePrecision(),
    scoreState: text("score_state"),
    raw: jsonb(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cycles_start_idx").on(t.startTime)],
);

/** Recovery, one per cycle. */
export const recoveries = pgTable("recoveries", {
  cycleId: bigint("cycle_id", { mode: "number" })
    .primaryKey()
    .references(() => cycles.id),
  sleepId: uuid("sleep_id"),
  recoveryScore: integer("recovery_score"),
  restingHr: integer("resting_hr"),
  hrvRmssdMilli: doublePrecision("hrv_rmssd_milli"),
  spo2: doublePrecision(),
  skinTempC: doublePrecision("skin_temp_c"),
  calibrating: boolean(),
  scoreState: text("score_state"),
  raw: jsonb(),
  updatedAt: updatedAt(),
});

/** Sleep activity (v2 UUID id). Durations stored in millis, as WHOOP returns. */
export const sleeps = pgTable(
  "sleeps",
  {
    id: uuid().primaryKey(),
    startTime: ts().notNull(),
    endTime: ts().notNull(),
    tzOffset: text("tz_offset"),
    isNap: boolean("is_nap").default(false),
    performancePct: doublePrecision("performance_pct"),
    consistencyPct: doublePrecision("consistency_pct"),
    efficiencyPct: doublePrecision("efficiency_pct"),
    respiratoryRate: doublePrecision("respiratory_rate"),
    needBaselineMilli: bigint("need_baseline_milli", { mode: "number" }),
    needFromDebtMilli: bigint("need_from_debt_milli", { mode: "number" }),
    needFromStrainMilli: bigint("need_from_strain_milli", { mode: "number" }),
    inBedMilli: bigint("in_bed_milli", { mode: "number" }),
    awakeMilli: bigint("awake_milli", { mode: "number" }),
    lightMilli: bigint("light_milli", { mode: "number" }),
    swsMilli: bigint("sws_milli", { mode: "number" }), // slow-wave (deep)
    remMilli: bigint("rem_milli", { mode: "number" }),
    noDataMilli: bigint("no_data_milli", { mode: "number" }),
    disturbanceCount: integer("disturbance_count"),
    sleepCycleCount: integer("sleep_cycle_count"),
    scoreState: text("score_state"),
    raw: jsonb(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sleeps_start_idx").on(t.startTime),
    index("sleeps_nap_idx").on(t.isNap),
  ],
);

/** Workout activity (v2 UUID id). HR zone durations in millis. */
export const workouts = pgTable(
  "workouts",
  {
    id: uuid().primaryKey(),
    startTime: ts().notNull(),
    endTime: ts().notNull(),
    tzOffset: text("tz_offset"),
    sportId: integer("sport_id"),
    sportName: text("sport_name"),
    strain: doublePrecision(),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    kilojoule: doublePrecision(),
    distanceMeter: doublePrecision("distance_meter"),
    altitudeGainM: doublePrecision("altitude_gain_m"),
    zone0Milli: bigint("zone0_milli", { mode: "number" }),
    zone1Milli: bigint("zone1_milli", { mode: "number" }),
    zone2Milli: bigint("zone2_milli", { mode: "number" }),
    zone3Milli: bigint("zone3_milli", { mode: "number" }),
    zone4Milli: bigint("zone4_milli", { mode: "number" }),
    zone5Milli: bigint("zone5_milli", { mode: "number" }),
    scoreState: text("score_state"),
    raw: jsonb(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("workouts_start_idx").on(t.startTime),
    index("workouts_sport_idx").on(t.sportId),
  ],
);

/** User-authored behavior tags (drives correlation analysis). */
export const dayTags = pgTable(
  "day_tags",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    day: date().notNull(),
    tag: text().notNull(), // travel | sick | stress | ...
    note: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("day_tags_day_idx").on(t.day), unique().on(t.day, t.tag)],
);

/** Life events overlaid on time-series charts. */
export const events = pgTable("events", {
  id: bigserial({ mode: "number" }).primaryKey(),
  startDay: date("start_day").notNull(),
  endDay: date("end_day"), // null = single day
  label: text().notNull(),
  type: text(), // race | illness | vacation | injury | other
  createdAt: ts().notNull().defaultNow(),
});

/** Sync bookkeeping per resource. */
export const syncState = pgTable("sync_state", {
  resource: text().primaryKey(), // cycles | recoveries | sleeps | workouts
  lastSynced: ts("last_synced"),
  cursor: text(), // last next_token if mid-backfill
  updatedAt: updatedAt(),
});

/** Cached weekly narrative digests (rule-based output as JSON). */
export const insightsCache = pgTable("insights_cache", {
  weekStart: date("week_start").primaryKey(),
  payload: jsonb().notNull(),
  generatedAt: ts("generated_at").notNull().defaultNow(),
});
