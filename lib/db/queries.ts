import { and, asc, between, desc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, parseISO, subDays } from "date-fns";

import { toLocalDay } from "@/lib/analytics/dates";
import type {
  DayRange,
  DaySeries,
  DayTagRow,
  EventRow,
  RecoveryDay,
  SleepDay,
  StrainDay,
  WorkoutRow,
} from "@/lib/analytics/types";
import { db } from "./client";
import {
  cycles,
  dayTags,
  events,
  recoveries,
  sleeps,
  syncState,
  workouts,
} from "./schema";

export interface DataSummary {
  counts: {
    cycles: number;
    recoveries: number;
    sleeps: number;
    workouts: number;
  };
  lastSynced: Date | null;
}

/** Row counts + most recent sync time, for the dashboard status panel. */
export async function getDataSummary(): Promise<DataSummary> {
  const [cycleCount, recoveryCount, sleepCount, workoutCount, states] =
    await Promise.all([
      db.$count(cycles),
      db.$count(recoveries),
      db.$count(sleeps),
      db.$count(workouts),
      db.select().from(syncState),
    ]);

  const lastSynced = states
    .map((s) => s.lastSynced)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    counts: {
      cycles: cycleCount,
      recoveries: recoveryCount,
      sleeps: sleepCount,
      workouts: workoutCount,
    },
    lastSynced,
  };
}

// --- analytics-ready readers ----------------------------------------------
//
// Each reader selects only the columns it needs over a local-day range and
// buckets every record to its **local** day via the record's `tz_offset`
// (never UTC). Bucketing happens in JS, so we widen the indexed `start_time`
// filter by a day on each side to be sure we capture records whose UTC instant
// sits just outside the range but whose local day falls inside it (max offset
// is < 24h). We then filter precisely by local day.

/** UTC instant bounds that safely enclose a local-day range (±1 day slack). */
function utcWindow(range: DayRange): { lo: Date; hi: Date } {
  return {
    lo: subDays(parseISO(`${range.from}T00:00:00Z`), 1),
    hi: addDays(parseISO(`${range.to}T00:00:00Z`), 1),
  };
}

/** Inclusive local-day membership (lexicographic works for `YYYY-MM-DD`). */
const inRange = (day: string, range: DayRange) =>
  day >= range.from && day <= range.to;

/**
 * Collapse rows to one per local day, keeping the last (rows must be ordered
 * ascending by start time). Returns entries sorted ascending by day.
 */
function byDay<T extends { day: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.day, row);
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Daily recovery metrics, bucketed by the owning cycle's local day. */
export async function getRecoverySeries(
  range: DayRange,
): Promise<RecoveryDay[]> {
  const { lo, hi } = utcWindow(range);
  const rows = await db
    .select({
      startTime: cycles.startTime,
      tzOffset: cycles.tzOffset,
      recoveryScore: recoveries.recoveryScore,
      restingHr: recoveries.restingHr,
      hrvRmssdMilli: recoveries.hrvRmssdMilli,
      spo2: recoveries.spo2,
      skinTempC: recoveries.skinTempC,
    })
    .from(recoveries)
    .innerJoin(cycles, eq(recoveries.cycleId, cycles.id))
    .where(and(gte(cycles.startTime, lo), lte(cycles.startTime, hi)))
    .orderBy(asc(cycles.startTime));

  return byDay(
    rows
      .map((r) => ({
        day: toLocalDay(r.startTime, r.tzOffset),
        recoveryScore: r.recoveryScore,
        restingHr: r.restingHr,
        hrvRmssdMilli: r.hrvRmssdMilli,
        spo2: r.spo2,
        skinTempC: r.skinTempC,
      }))
      .filter((r) => inRange(r.day, range)),
  );
}

/** Daily cycle strain metrics, bucketed by the cycle's local day. */
export async function getStrainSeries(range: DayRange): Promise<StrainDay[]> {
  const { lo, hi } = utcWindow(range);
  const rows = await db
    .select({
      startTime: cycles.startTime,
      tzOffset: cycles.tzOffset,
      strain: cycles.strain,
      avgHr: cycles.avgHr,
      maxHr: cycles.maxHr,
      kilojoule: cycles.kilojoule,
    })
    .from(cycles)
    .where(and(gte(cycles.startTime, lo), lte(cycles.startTime, hi)))
    .orderBy(asc(cycles.startTime));

  return byDay(
    rows
      .map((r) => ({
        day: toLocalDay(r.startTime, r.tzOffset),
        strain: r.strain,
        avgHr: r.avgHr,
        maxHr: r.maxHr,
        kilojoule: r.kilojoule,
      }))
      .filter((r) => inRange(r.day, range)),
  );
}

/**
 * Daily main-sleep metrics, bucketed by **wake** (`end_time`) local day so each
 * night aligns with that morning's recovery cycle. Naps are excluded.
 */
export async function getSleepSeries(range: DayRange): Promise<SleepDay[]> {
  const { lo, hi } = utcWindow(range);
  const rows = await db
    .select()
    .from(sleeps)
    .where(
      and(
        eq(sleeps.isNap, false),
        gte(sleeps.endTime, lo),
        lte(sleeps.endTime, hi),
      ),
    )
    .orderBy(asc(sleeps.endTime));

  return byDay(
    rows
      .map((r) => ({
        day: toLocalDay(r.endTime, r.tzOffset),
        startTime: r.startTime,
        endTime: r.endTime,
        tzOffset: r.tzOffset,
        performancePct: r.performancePct,
        consistencyPct: r.consistencyPct,
        efficiencyPct: r.efficiencyPct,
        respiratoryRate: r.respiratoryRate,
        needBaselineMilli: r.needBaselineMilli,
        needFromDebtMilli: r.needFromDebtMilli,
        needFromStrainMilli: r.needFromStrainMilli,
        inBedMilli: r.inBedMilli,
        awakeMilli: r.awakeMilli,
        lightMilli: r.lightMilli,
        swsMilli: r.swsMilli,
        remMilli: r.remMilli,
        noDataMilli: r.noDataMilli,
        disturbanceCount: r.disturbanceCount,
        sleepCycleCount: r.sleepCycleCount,
      }))
      .filter((r) => inRange(r.day, range)),
  );
}

/**
 * Workouts in range, bucketed to each workout's start local day. Not collapsed
 * to one per day — several workouts can occur — so this is a flat list.
 */
export async function getWorkouts(range: DayRange): Promise<WorkoutRow[]> {
  const { lo, hi } = utcWindow(range);
  const rows = await db
    .select({
      id: workouts.id,
      startTime: workouts.startTime,
      endTime: workouts.endTime,
      tzOffset: workouts.tzOffset,
      sportName: workouts.sportName,
      strain: workouts.strain,
      avgHr: workouts.avgHr,
      maxHr: workouts.maxHr,
      kilojoule: workouts.kilojoule,
      distanceMeter: workouts.distanceMeter,
      altitudeGainM: workouts.altitudeGainM,
      zone0Milli: workouts.zone0Milli,
      zone1Milli: workouts.zone1Milli,
      zone2Milli: workouts.zone2Milli,
      zone3Milli: workouts.zone3Milli,
      zone4Milli: workouts.zone4Milli,
      zone5Milli: workouts.zone5Milli,
    })
    .from(workouts)
    .where(and(gte(workouts.startTime, lo), lte(workouts.startTime, hi)))
    .orderBy(asc(workouts.startTime));

  return rows
    .map((r) => ({
      id: r.id,
      day: toLocalDay(r.startTime, r.tzOffset),
      startTime: r.startTime,
      endTime: r.endTime,
      sportName: r.sportName,
      strain: r.strain,
      avgHr: r.avgHr,
      maxHr: r.maxHr,
      kilojoule: r.kilojoule,
      distanceMeter: r.distanceMeter,
      altitudeGainM: r.altitudeGainM,
      zoneMilli: [
        r.zone0Milli,
        r.zone1Milli,
        r.zone2Milli,
        r.zone3Milli,
        r.zone4Milli,
        r.zone5Milli,
      ] as WorkoutRow["zoneMilli"],
    }))
    .filter((r) => inRange(r.day, range));
}

/**
 * User-authored day tags in range. `day` is already stored as a local date,
 * so no offset bucketing is needed.
 */
export async function getDayTags(range: DayRange): Promise<DayTagRow[]> {
  const rows = await db
    .select({ day: dayTags.day, tag: dayTags.tag, note: dayTags.note })
    .from(dayTags)
    .where(between(dayTags.day, range.from, range.to))
    .orderBy(asc(dayTags.day), asc(dayTags.tag));
  return rows;
}

/** Every user-authored day tag (full history), for driver analysis. */
export async function getAllDayTags(): Promise<DayTagRow[]> {
  return db
    .select({ day: dayTags.day, tag: dayTags.tag, note: dayTags.note })
    .from(dayTags)
    .orderBy(asc(dayTags.day), asc(dayTags.tag));
}

/** Full-history daily HRV (rMSSD millis), bucketed by the cycle's local day. */
export async function getHrvDays(): Promise<DaySeries> {
  const rows = await db
    .select({
      startTime: cycles.startTime,
      tzOffset: cycles.tzOffset,
      hrvRmssdMilli: recoveries.hrvRmssdMilli,
    })
    .from(recoveries)
    .innerJoin(cycles, eq(recoveries.cycleId, cycles.id))
    .orderBy(asc(cycles.startTime));

  return byDay(
    rows.map((r) => ({
      day: toLocalDay(r.startTime, r.tzOffset),
      value: r.hrvRmssdMilli,
    })),
  );
}

/** Every event (full history), most recent first, for the event editor. */
export async function getAllEvents(): Promise<EventRow[]> {
  return db
    .select({
      id: events.id,
      startDay: events.startDay,
      endDay: events.endDay,
      label: events.label,
      type: events.type,
    })
    .from(events)
    .orderBy(desc(events.startDay));
}

/**
 * Events overlapping the range. An event overlaps when it starts on or before
 * `to` and ends (or, for single-day events, starts) on or after `from`.
 */
export async function getEvents(range: DayRange): Promise<EventRow[]> {
  const rows = await db
    .select({
      id: events.id,
      startDay: events.startDay,
      endDay: events.endDay,
      label: events.label,
      type: events.type,
    })
    .from(events)
    .where(
      and(
        lte(events.startDay, range.to),
        gte(sql`coalesce(${events.endDay}, ${events.startDay})`, range.from),
      ),
    )
    .orderBy(asc(events.startDay));
  return rows;
}

/**
 * Full-history daily recovery score (bucketed by the owning cycle's local day),
 * for the calendar heatmap. Unbounded by range — the heatmap shows everything.
 */
export async function getRecoveryDays(): Promise<DaySeries> {
  const rows = await db
    .select({
      startTime: cycles.startTime,
      tzOffset: cycles.tzOffset,
      recoveryScore: recoveries.recoveryScore,
    })
    .from(recoveries)
    .innerJoin(cycles, eq(recoveries.cycleId, cycles.id))
    .orderBy(asc(cycles.startTime));

  return byDay(
    rows.map((r) => ({
      day: toLocalDay(r.startTime, r.tzOffset),
      value: r.recoveryScore,
    })),
  );
}

/**
 * Full-history daily cycle strain (bucketed by the cycle's local day). Unbounded
 * by range — period comparisons (MoM/YoY) need months outside any one window.
 */
export async function getStrainDays(): Promise<DaySeries> {
  const rows = await db
    .select({
      startTime: cycles.startTime,
      tzOffset: cycles.tzOffset,
      strain: cycles.strain,
    })
    .from(cycles)
    .orderBy(asc(cycles.startTime));

  return byDay(
    rows.map((r) => ({
      day: toLocalDay(r.startTime, r.tzOffset),
      value: r.strain,
    })),
  );
}

/**
 * Full-history daily sleep performance (bucketed by **wake** local day, naps
 * excluded). Unbounded by range — for MoM/YoY period comparisons.
 */
export async function getSleepPerformanceDays(): Promise<DaySeries> {
  const rows = await db
    .select({
      endTime: sleeps.endTime,
      tzOffset: sleeps.tzOffset,
      performancePct: sleeps.performancePct,
    })
    .from(sleeps)
    .where(eq(sleeps.isNap, false))
    .orderBy(asc(sleeps.endTime));

  return byDay(
    rows.map((r) => ({
      day: toLocalDay(r.endTime, r.tzOffset),
      value: r.performancePct,
    })),
  );
}
