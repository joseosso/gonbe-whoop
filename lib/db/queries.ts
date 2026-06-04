import { db } from "./client";
import { cycles, recoveries, sleeps, syncState, workouts } from "./schema";

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
