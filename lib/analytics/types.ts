/**
 * Canonical shapes the analytics layer consumes. These decouple analytics from
 * Drizzle row types so the formulas (baseline, EWMA, sleep debt, …) stay pure
 * and unit-testable without touching the DB.
 *
 * Every record is bucketed to its **local** calendar day using the record's
 * `tz_offset` (see `dates.ts`), so a "day" matches what the WHOOP app shows.
 */

/** A calendar day in the record's local timezone, formatted `YYYY-MM-DD`. */
export type Day = string;

/** Inclusive local-day window (both bounds `YYYY-MM-DD`). */
export interface DayRange {
  from: Day;
  to: Day;
}

/**
 * The canonical single-metric point. `value` is `null` when the metric is
 * missing for that day (e.g. unscored / calibrating); analytics functions are
 * null-gap aware.
 */
export interface DayPoint {
  day: Day;
  value: number | null;
}

/** A single metric over time, ordered ascending by day. */
export type DaySeries = DayPoint[];

/** Recovery metrics for one local day (bucketed by the owning cycle). */
export interface RecoveryDay {
  day: Day;
  recoveryScore: number | null;
  restingHr: number | null;
  hrvRmssdMilli: number | null;
  spo2: number | null;
  skinTempC: number | null;
}

/** Cycle-level strain metrics for one local day. */
export interface StrainDay {
  day: Day;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kilojoule: number | null;
}

/**
 * Main-sleep metrics for one local day, attributed to the **wake** day
 * (`end_time`'s local day) so it aligns with that morning's recovery cycle.
 * Naps are excluded. `startTime`/`endTime`/`tzOffset` are retained so the
 * regularity formula can derive local bed/wake clock-minutes.
 */
export interface SleepDay {
  day: Day;
  startTime: Date;
  endTime: Date;
  tzOffset: string | null;
  performancePct: number | null;
  consistencyPct: number | null;
  efficiencyPct: number | null;
  respiratoryRate: number | null;
  // sleep need (millis)
  needBaselineMilli: number | null;
  needFromDebtMilli: number | null;
  needFromStrainMilli: number | null;
  // stage summary (millis)
  inBedMilli: number | null;
  awakeMilli: number | null;
  lightMilli: number | null;
  swsMilli: number | null;
  remMilli: number | null;
  noDataMilli: number | null;
  disturbanceCount: number | null;
  sleepCycleCount: number | null;
}

/**
 * One workout, bucketed to its start's local day. Workouts are not collapsed to
 * one per day (several can occur), so this is a flat list rather than a series.
 */
export interface WorkoutRow {
  id: string;
  day: Day;
  startTime: Date;
  endTime: Date;
  sportName: string | null;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kilojoule: number | null;
  distanceMeter: number | null;
  altitudeGainM: number | null;
  /** HR-zone durations (millis), zone 0 → 5. */
  zoneMilli: [
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
  ];
}

/** A user-authored behavior tag on a local day. */
export interface DayTagRow {
  day: Day;
  tag: string;
  note: string | null;
}

/** A life event spanning one or more local days (overlaid on time-series). */
export interface EventRow {
  id: number;
  startDay: Day;
  endDay: Day | null;
  label: string;
  type: string | null;
}
