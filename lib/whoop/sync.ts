import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  cycles,
  recoveries,
  sleeps,
  syncState,
  workouts,
} from "@/lib/db/schema";
import { paginate, type DateRange } from "./client";
import * as s from "./schemas";

// Re-fetch this much history before the last sync to catch re-scored records.
const RESCORE_OVERLAP_DAYS = 7;
const UPSERT_CHUNK = 200;

type Resource = "cycles" | "recoveries" | "sleeps" | "workouts";

export interface SyncResult {
  cycles: number;
  recoveries: number;
  sleeps: number;
  workouts: number;
}

// --- record → row mappers -------------------------------------------------

const mapCycle = (c: s.Cycle) => ({
  id: c.id,
  startTime: new Date(c.start),
  endTime: c.end ? new Date(c.end) : null,
  tzOffset: c.timezone_offset ?? null,
  strain: c.score?.strain ?? null,
  avgHr: c.score?.average_heart_rate ?? null,
  maxHr: c.score?.max_heart_rate ?? null,
  kilojoule: c.score?.kilojoule ?? null,
  scoreState: c.score_state ?? null,
  raw: c,
  updatedAt: new Date(),
});

const mapRecovery = (r: s.Recovery) => ({
  cycleId: r.cycle_id,
  sleepId: r.sleep_id ?? null,
  recoveryScore: r.score?.recovery_score ?? null,
  restingHr: r.score?.resting_heart_rate ?? null,
  hrvRmssdMilli: r.score?.hrv_rmssd_milli ?? null,
  spo2: r.score?.spo2_percentage ?? null,
  skinTempC: r.score?.skin_temp_celsius ?? null,
  calibrating: r.score?.user_calibrating ?? null,
  scoreState: r.score_state ?? null,
  raw: r,
  updatedAt: new Date(),
});

const mapSleep = (sl: s.Sleep) => {
  const stage = sl.score?.stage_summary;
  const need = sl.score?.sleep_needed;
  return {
    id: sl.id,
    startTime: new Date(sl.start),
    endTime: new Date(sl.end),
    tzOffset: sl.timezone_offset ?? null,
    isNap: sl.nap ?? false,
    performancePct: sl.score?.sleep_performance_percentage ?? null,
    consistencyPct: sl.score?.sleep_consistency_percentage ?? null,
    efficiencyPct: sl.score?.sleep_efficiency_percentage ?? null,
    respiratoryRate: sl.score?.respiratory_rate ?? null,
    needBaselineMilli: need?.baseline_milli ?? null,
    needFromDebtMilli: need?.need_from_sleep_debt_milli ?? null,
    needFromStrainMilli: need?.need_from_recent_strain_milli ?? null,
    inBedMilli: stage?.total_in_bed_time_milli ?? null,
    awakeMilli: stage?.total_awake_time_milli ?? null,
    lightMilli: stage?.total_light_sleep_time_milli ?? null,
    swsMilli: stage?.total_slow_wave_sleep_time_milli ?? null,
    remMilli: stage?.total_rem_sleep_time_milli ?? null,
    noDataMilli: stage?.total_no_data_time_milli ?? null,
    disturbanceCount: stage?.disturbance_count ?? null,
    sleepCycleCount: stage?.sleep_cycle_count ?? null,
    scoreState: sl.score_state ?? null,
    raw: sl,
    updatedAt: new Date(),
  };
};

const mapWorkout = (w: s.Workout) => {
  const z = w.score?.zone_durations;
  return {
    id: w.id,
    startTime: new Date(w.start),
    endTime: new Date(w.end),
    tzOffset: w.timezone_offset ?? null,
    sportId: w.sport_id ?? null,
    sportName: w.sport_name ?? null,
    strain: w.score?.strain ?? null,
    avgHr: w.score?.average_heart_rate ?? null,
    maxHr: w.score?.max_heart_rate ?? null,
    kilojoule: w.score?.kilojoule ?? null,
    distanceMeter: w.score?.distance_meter ?? null,
    altitudeGainM: w.score?.altitude_gain_meter ?? null,
    zone0Milli: z?.zone_zero_milli ?? null,
    zone1Milli: z?.zone_one_milli ?? null,
    zone2Milli: z?.zone_two_milli ?? null,
    zone3Milli: z?.zone_three_milli ?? null,
    zone4Milli: z?.zone_four_milli ?? null,
    zone5Milli: z?.zone_five_milli ?? null,
    scoreState: w.score_state ?? null,
    raw: w,
    updatedAt: new Date(),
  };
};

// --- generic upsert -------------------------------------------------------

/** Upsert rows in chunks, replacing every non-key column on conflict. */
async function upsert<T extends PgTable>(
  table: T,
  rows: Record<string, unknown>[],
  conflictTarget: string,
) {
  if (rows.length === 0) return;

  // Map each non-key column to its EXCLUDED value, using Drizzle's real names.
  const columns = getTableColumns(table);
  const set = Object.fromEntries(
    Object.entries(columns)
      .filter(([key]) => key !== conflictTarget)
      .map(([key, col]) => [key, sql`excluded.${sql.identifier(col.name)}`]),
  );

  const target = (table as Record<string, unknown>)[conflictTarget];

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    await db
      .insert(table)
      .values(chunk as never)
      .onConflictDoUpdate({ target: target as never, set: set as never });
  }
}

// --- orchestration --------------------------------------------------------

/** Compute the date range to pull, based on the last successful sync. */
async function rangeFor(resource: Resource): Promise<DateRange> {
  const state = await db.query.syncState.findFirst({
    where: (t, { eq }) => eq(t.resource, resource),
  });
  if (!state?.lastSynced) return {}; // first run → full history
  const start = new Date(state.lastSynced);
  start.setDate(start.getDate() - RESCORE_OVERLAP_DAYS);
  return { start: start.toISOString() };
}

async function markSynced(resource: Resource) {
  await db
    .insert(syncState)
    .values({ resource, lastSynced: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.resource,
      set: { lastSynced: new Date(), updatedAt: new Date() },
    });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

/** Pull all four resources from WHOOP and upsert them. Idempotent. */
export async function runSync(): Promise<SyncResult> {
  const cycleRows = (
    await collect(paginate("/v2/cycle", s.cycle, await rangeFor("cycles")))
  ).map(mapCycle);
  await upsert(cycles, cycleRows, "id");
  await markSynced("cycles");

  const recoveryRows = (
    await collect(
      paginate("/v2/recovery", s.recovery, await rangeFor("recoveries")),
    )
  ).map(mapRecovery);
  // Recoveries FK to cycles; skip any whose cycle isn't in the DB (avoids a
  // constraint error aborting the whole sync if the pair is out of range).
  const existingCycles = await db.select({ id: cycles.id }).from(cycles);
  const cycleIds = new Set(existingCycles.map((c) => c.id));
  const safeRecoveries = recoveryRows.filter((r) => cycleIds.has(r.cycleId));
  await upsert(recoveries, safeRecoveries, "cycleId");
  await markSynced("recoveries");

  const sleepRows = (
    await collect(
      paginate("/v2/activity/sleep", s.sleep, await rangeFor("sleeps")),
    )
  ).map(mapSleep);
  await upsert(sleeps, sleepRows, "id");
  await markSynced("sleeps");

  const workoutRows = (
    await collect(
      paginate("/v2/activity/workout", s.workout, await rangeFor("workouts")),
    )
  ).map(mapWorkout);
  await upsert(workouts, workoutRows, "id");
  await markSynced("workouts");

  return {
    cycles: cycleRows.length,
    recoveries: safeRecoveries.length,
    sleeps: sleepRows.length,
    workouts: workoutRows.length,
  };
}
