import { meanStdev, rollingBaseline, type Stats } from "./baseline";
import { nextDay } from "./dates";
import type { Day, DaySeries } from "./types";

/**
 * Workout ROI — recovery cost per session (Plan §5.3). Ranks sport types by the
 * adaptation bought (workout strain / energy) against the recovery spent: for
 * each workout, the **next-day** recovery is compared to its own trailing
 * baseline (reuse the §2.3 next-day join + `rollingBaseline`), then grouped by
 * `sportName`. A session that drops next-day recovery below baseline has a
 * negative delta — a recovery cost; one that recovers easy is positive.
 *
 * Per-group `n` and spread are surfaced and thin groups flagged low-confidence
 * rather than dropped (SPEC §5 statistical-honesty). Pure — the page joins
 * recovery + workouts and renders the ranking.
 */

/** Trailing window (days) for the recovery baseline each delta is measured against. */
export const ROI_BASELINE_WINDOW = 30;
/** Below this many evaluable sessions, a sport's ROI is flagged low-confidence. */
export const ROI_MIN_N = 5;
/** Energy unit for the per-kilojoule ratio: recovery delta per 1,000 kJ. */
const KJ_UNIT = 1000;

/**
 * One workout reduced to the fields the ROI join needs. `WorkoutRow` is
 * structurally assignable, so the page passes its workouts directly.
 */
export interface RoiWorkout {
  day: Day;
  sportName: string | null;
  strain: number | null;
  kilojoule: number | null;
}

/** Recovery ROI for one sport type, over the evaluable sessions in range. */
export interface SportRoi {
  /** `sportName`, or `"Unknown"` when WHOOP didn't label the workout. */
  sport: string;
  /** Evaluable sessions: workout strain present **and** a scored next-day recovery. */
  n: number;
  /** Next-day recovery minus its trailing baseline (points; negative = a cost). */
  recoveryDelta: Stats;
  /** Recovery delta per unit workout strain (negative = costly per strain). */
  perStrain: Stats;
  /** Recovery delta per 1,000 kJ burned (negative = costly per energy). */
  perKilojoule: Stats;
  /** Mean workout strain in the group, for context. */
  strain: Stats;
  /** `n` below `minN` — surface as low-confidence, don't drop (SPEC §5 honesty). */
  lowConfidence: boolean;
}

/** A single evaluable session's deltas, before grouping. */
interface Session {
  sport: string;
  delta: number;
  perStrain: number | null;
  perKilojoule: number | null;
  strain: number;
}

const nonNull = (v: number | null): v is number => v !== null;

/**
 * Rank sport types by recovery cost per session. `recovery` is the densified
 * daily recovery-score series (one point per day, missing days `null`) so the
 * positional baseline window equals a calendar window; the baseline is read
 * **at the workout day** (excluding the outcome day) to avoid the session's own
 * effect leaking into its reference. Groups are returned costliest-per-strain
 * first (most negative `perStrain`); groups without a per-strain ratio sort
 * last, ties broken by sport name for determinism.
 */
export function workoutRoi(
  workouts: RoiWorkout[],
  recovery: DaySeries,
  {
    window = ROI_BASELINE_WINDOW,
    minN = ROI_MIN_N,
  }: { window?: number; minN?: number } = {},
): SportRoi[] {
  // Recovery score on a day, and its trailing baseline mean as of that day.
  const scoreByDay = new Map<Day, number>();
  for (const p of recovery) {
    if (p.value !== null) scoreByDay.set(p.day, p.value);
  }
  const baselineByDay = new Map<Day, number>();
  for (const b of rollingBaseline(recovery, window)) {
    if (b.mean !== null) baselineByDay.set(b.day, b.mean);
  }

  const groups = new Map<string, Session[]>();
  for (const w of workouts) {
    if (w.strain === null) continue;
    const base = baselineByDay.get(w.day);
    const next = scoreByDay.get(nextDay(w.day));
    // Not evaluable without a reference baseline and a scored next-day recovery.
    if (base === undefined || next === undefined) continue;

    const delta = next - base;
    const sport = w.sportName ?? "Unknown";
    const session: Session = {
      sport,
      delta,
      perStrain: w.strain > 0 ? delta / w.strain : null,
      perKilojoule:
        w.kilojoule !== null && w.kilojoule > 0
          ? delta / (w.kilojoule / KJ_UNIT)
          : null,
      strain: w.strain,
    };
    const group = groups.get(sport);
    if (group) group.push(session);
    else groups.set(sport, [session]);
  }

  const result = [...groups.entries()].map(([sport, sessions]) => ({
    sport,
    n: sessions.length,
    recoveryDelta: meanStdev(sessions.map((s) => s.delta)),
    perStrain: meanStdev(sessions.map((s) => s.perStrain).filter(nonNull)),
    perKilojoule: meanStdev(sessions.map((s) => s.perKilojoule).filter(nonNull)),
    strain: meanStdev(sessions.map((s) => s.strain)),
    lowConfidence: sessions.length < minN,
  }));

  return result.sort((a, b) => {
    const am = a.perStrain.mean;
    const bm = b.perStrain.mean;
    if (am === null && bm === null) return a.sport.localeCompare(b.sport);
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return am - bm;
    return a.sport.localeCompare(b.sport);
  });
}
