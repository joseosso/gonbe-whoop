import { meanStdev, type Stats } from "./baseline";
import type { DaySeries } from "./types";

/** A calendar month, formatted `YYYY-MM`. */
export type Month = string;

/** Mean ± SD (and n) of a metric over one calendar month. */
export interface MonthStat extends Stats {
  month: Month;
}

/** A month's mean with its month-over-month and year-over-year comparisons. */
export interface MonthComparison extends MonthStat {
  /** Prior calendar month's stats, or `null` if absent. */
  prevMonth: MonthStat | null;
  /** Same calendar month one year earlier, or `null` if absent. */
  prevYear: MonthStat | null;
  /** `mean − prevMonth.mean`; `null` when either is undefined. */
  momDelta: number | null;
  /** `mean − prevYear.mean`; `null` when either is undefined. */
  yoyDelta: number | null;
}

/** Calendar month a local day belongs to. Days are already local-day keyed. */
export const monthOf = (day: string): Month => day.slice(0, 7);

/**
 * Shift a `YYYY-MM` month by a whole number of months (negative = earlier),
 * rolling the year over correctly (`2024-01` − 1 → `2023-12`).
 */
export function shiftMonth(month: Month, deltaMonths: number): Month {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/**
 * Mean ± SD per calendar month (SPEC §5 MoM/YoY). `null` values are skipped;
 * months with no observations are omitted. Returns ascending by month. Bucketing
 * is by the day's **local** calendar month, so it matches what you experienced.
 */
export function monthlyMeans(series: DaySeries): MonthStat[] {
  const buckets = new Map<Month, number[]>();
  for (const point of series) {
    if (point.value === null) continue;
    const month = monthOf(point.day);
    const bucket = buckets.get(month);
    if (bucket) bucket.push(point.value);
    else buckets.set(month, [point.value]);
  }

  return [...buckets.entries()]
    .map(([month, values]) => ({ month, ...meanStdev(values) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

const diff = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null ? a - b : null;

/**
 * Monthly means annotated with month-over-month (vs the prior calendar month)
 * and year-over-year (vs the same month one year earlier) deltas. Comparisons
 * are looked up by exact calendar month, so gaps simply yield `null` deltas
 * rather than comparing against a non-adjacent month.
 */
export function comparePeriods(series: DaySeries): MonthComparison[] {
  const months = monthlyMeans(series);
  const byMonth = new Map(months.map((m) => [m.month, m]));

  return months.map((m) => {
    const prevMonth = byMonth.get(shiftMonth(m.month, -1)) ?? null;
    const prevYear = byMonth.get(shiftMonth(m.month, -12)) ?? null;
    return {
      ...m,
      prevMonth,
      prevYear,
      momDelta: diff(m.mean, prevMonth?.mean ?? null),
      yoyDelta: diff(m.mean, prevYear?.mean ?? null),
    };
  });
}
