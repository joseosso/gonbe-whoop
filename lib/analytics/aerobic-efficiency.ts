import { meanStdev } from "./baseline";
import { ewma } from "./ewma";
import { monthOf, type Month, monthlyMeans, shiftMonth } from "./periods";
import type { DaySeries, WorkoutRow } from "./types";

/**
 * Aerobic-efficiency tracker (Plan §5.5). An objective fitness signal WHOOP
 * doesn't expose: for comparable steady efforts (same `sportName`, aerobic zone
 * profile), track output **per average heart-rate** over time — the same work at
 * a lower HR means an improving aerobic base. Monthly mean index, EWMA-smoothed,
 * with `n` per month so sparse months aren't over-claimed. A declining resting
 * HR and rising HRV baseline are surfaced as a confirming second signal. Pure —
 * the page filters to comparable workouts and renders the trend.
 */

/** Output numerator for the per-HR ratio. */
export type EfficiencyMetric = "kilojoule" | "strain";

/** Months with fewer comparable workouts than this are flagged low-confidence. */
export const EFFICIENCY_MIN_N = 3;
/**
 * A workout counts as a "steady" aerobic effort — and so comparable — when its
 * high-intensity share (WHOOP Z4+Z5) is at most this. Spiky interval / race
 * sessions are excluded so the index reflects aerobic base, not session type.
 */
export const STEADY_MAX_HIGH_SHARE = 0.5;
/** EWMA smoothing factor for the monthly index. */
export const EFFICIENCY_ALPHA = 0.3;

/** A workout reduced to the fields the efficiency join needs. `WorkoutRow` fits. */
export type EfficiencyWorkout = Pick<
  WorkoutRow,
  "day" | "sportName" | "avgHr" | "kilojoule" | "strain" | "zoneMilli"
>;

/** One month of the efficiency trend. */
export interface EfficiencyMonth {
  month: Month;
  /** Mean output-per-HR over comparable workouts that month; `null` if none. */
  index: number | null;
  /** EWMA-smoothed index; `null` across gaps. */
  smoothed: number | null;
  /** Comparable workouts backing the month. */
  n: number;
  /** `index` present but `n < minN` — thin, treat as a hint. */
  lowConfidence: boolean;
}

/** A confirming baseline signal (resting HR / HRV) over the same span. */
export interface ConfirmSignal {
  first: number | null;
  last: number | null;
  /** `last − first` of the monthly means; `null` when not computable. */
  delta: number | null;
  /** Direction-aware: RHR improves falling, HRV improves rising; `null` if N/A. */
  improving: boolean | null;
}

export interface AerobicEfficiency {
  /** Sport analyzed (`null` only when there's nothing to analyze). */
  sport: string | null;
  metric: EfficiencyMetric;
  /** Comparable workouts analyzed. */
  n: number;
  months: EfficiencyMonth[];
  confirm: { restingHr: ConfirmSignal; hrv: ConfirmSignal };
  /** No comparable workouts in the input. */
  empty: boolean;
}

const sportKey = (w: EfficiencyWorkout): string => w.sportName ?? "Unknown";

const outputOf = (w: EfficiencyWorkout, metric: EfficiencyMetric): number | null =>
  metric === "kilojoule" ? w.kilojoule : w.strain;

/** High-intensity share (Z4+Z5); `null` when the workout has no zone time. */
function highShare(w: EfficiencyWorkout): number | null {
  const total = w.zoneMilli.reduce<number>((sum, ms) => sum + (ms ?? 0), 0);
  if (total === 0) return null;
  return ((w.zoneMilli[4] ?? 0) + (w.zoneMilli[5] ?? 0)) / total;
}

/** Every month from `from` to `to` inclusive (lexicographic `YYYY-MM` order). */
function eachMonth(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** Reduce a monthly mean series to its first/last/delta + improving direction. */
function confirmSignal(
  series: DaySeries,
  improvesRising: boolean,
): ConfirmSignal {
  const months = monthlyMeans(series).filter((m) => m.mean !== null);
  const first = months.length ? (months[0].mean as number) : null;
  const last = months.length ? (months[months.length - 1].mean as number) : null;
  const delta = first !== null && last !== null ? last - first : null;
  const improving =
    delta === null ? null : improvesRising ? delta > 0 : delta < 0;
  return { first, last, delta, improving };
}

/**
 * Build the aerobic-efficiency trend. Workouts are kept only when comparable:
 * a present, positive output and average HR, and a steady aerobic zone profile
 * (high-intensity share ≤ `maxHighShare`; workouts with no zone data are kept).
 * When `sport` is omitted the dominant comparable sport is chosen (most
 * workouts, ties broken alphabetically). The monthly index is EWMA-smoothed over
 * a contiguous month axis so gaps don't compress the trend. `confirm` reports the
 * resting-HR and HRV baseline direction over the same span.
 */
export function aerobicEfficiency(
  workouts: EfficiencyWorkout[],
  confirm: { restingHr: DaySeries; hrv: DaySeries },
  {
    metric = "kilojoule",
    sport,
    minN = EFFICIENCY_MIN_N,
    maxHighShare = STEADY_MAX_HIGH_SHARE,
    alpha = EFFICIENCY_ALPHA,
  }: {
    metric?: EfficiencyMetric;
    sport?: string;
    minN?: number;
    maxHighShare?: number;
    alpha?: number;
  } = {},
): AerobicEfficiency {
  const confirmSignals = {
    restingHr: confirmSignal(confirm.restingHr, false),
    hrv: confirmSignal(confirm.hrv, true),
  };

  const comparable = workouts.filter((w) => {
    const out = outputOf(w, metric);
    if (out === null || out <= 0 || w.avgHr === null || w.avgHr <= 0) {
      return false;
    }
    const high = highShare(w);
    return high === null || high <= maxHighShare;
  });

  if (comparable.length === 0) {
    return {
      sport: null,
      metric,
      n: 0,
      months: [],
      confirm: confirmSignals,
      empty: true,
    };
  }

  // Choose the sport: caller's, else the most-represented comparable sport.
  let chosen = sport;
  if (chosen === undefined) {
    const counts = new Map<string, number>();
    for (const w of comparable) {
      const key = sportKey(w);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    chosen = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
  }

  const sessions = comparable.filter((w) => sportKey(w) === chosen);
  if (sessions.length === 0) {
    return {
      sport: chosen,
      metric,
      n: 0,
      months: [],
      confirm: confirmSignals,
      empty: true,
    };
  }

  // Per-month index values (output ÷ avg HR).
  const byMonth = new Map<Month, number[]>();
  for (const w of sessions) {
    const idx = (outputOf(w, metric) as number) / (w.avgHr as number);
    const month = monthOf(w.day);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(idx);
    else byMonth.set(month, [idx]);
  }

  const present = [...byMonth.keys()].sort();
  const axis = eachMonth(present[0], present[present.length - 1]);

  const indexSeries: DaySeries = axis.map((month) => ({
    day: month,
    value: meanStdev(byMonth.get(month) ?? []).mean,
  }));
  const smoothed = ewma(indexSeries, alpha);

  const months: EfficiencyMonth[] = axis.map((month, i) => {
    const stats = meanStdev(byMonth.get(month) ?? []);
    return {
      month,
      index: stats.mean,
      smoothed: smoothed[i].value,
      n: stats.n,
      lowConfidence: stats.mean !== null && stats.n < minN,
    };
  });

  return {
    sport: chosen,
    metric,
    n: sessions.length,
    months,
    confirm: confirmSignals,
    empty: false,
  };
}
