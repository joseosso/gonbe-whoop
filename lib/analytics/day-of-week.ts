import { meanStdev, type Stats } from "./baseline";
import { WEEKDAYS, weekdayIndex, type Weekday } from "./dates";
import type { DaySeries } from "./types";

/** A single weekday's stats vs the overall mean (SPEC §5 day-of-week effect). */
export interface WeekdayStat extends Stats {
  weekday: Weekday;
  /** 0 = Sun … 6 = Sat (matches `Date.getUTCDay`). */
  index: number;
  /** Weekday mean − overall mean; `null` when either is undefined. */
  delta: number | null;
}

/** Per-weekday means/deltas plus the overall baseline they're measured against. */
export interface DayOfWeekResult {
  /** Mean ± SD over every non-null day in the series. */
  overall: Stats;
  /** Length 7, ordered Sun → Sat (index = `Date.getUTCDay`). */
  byWeekday: WeekdayStat[];
}

/**
 * Day-of-week effect (SPEC §5): for each weekday, the mean ± SD of the metric on
 * that weekday and its delta from the overall mean, with `n` so small samples
 * can be flagged in the UI. `null` values are skipped; weekdays with no data
 * report `n = 0` and `null` stats/delta. Days are bucketed by their local
 * calendar date (the series is already local-day keyed).
 */
export function dayOfWeekEffect(series: DaySeries): DayOfWeekResult {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  const all: number[] = [];

  for (const point of series) {
    if (point.value === null) continue;
    buckets[weekdayIndex(point.day)].push(point.value);
    all.push(point.value);
  }

  const overall = meanStdev(all);
  const byWeekday = WEEKDAYS.map((weekday, index) => {
    const stats = meanStdev(buckets[index]);
    const delta =
      stats.mean !== null && overall.mean !== null
        ? stats.mean - overall.mean
        : null;
    return { weekday, index, ...stats, delta };
  });

  return { overall, byWeekday };
}
