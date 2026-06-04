import { meanStdev, type Stats } from "./baseline";
import { nextDay } from "./dates";
import type { Day, DaySeries } from "./types";

/** Below this many tagged observations, a driver is flagged low-confidence. */
export const DEFAULT_MIN_N = 5;

/** A tag's effect on the **next-day** outcome metric (SPEC §5 driver analysis). */
export interface TagDriver {
  tag: string;
  /** Mean next-day outcome on days carrying the tag. */
  taggedMean: number | null;
  taggedN: number;
  /** Mean next-day outcome on days without the tag. */
  untaggedMean: number | null;
  untaggedN: number;
  /** `taggedMean − untaggedMean`; `null` when either group is empty. */
  delta: number | null;
  /** Cohen's d (pooled-SD effect size); `null` when not computable. */
  effectSize: number | null;
  /** Tagged sample below `minN` — surface as low-confidence in the UI. */
  lowConfidence: boolean;
}

/** Cohen's d using the pooled standard deviation of two groups. */
function cohensD(a: Stats, b: Stats): number | null {
  if (a.mean === null || b.mean === null || a.sd === null || b.sd === null) {
    return null;
  }
  const df = a.n + b.n - 2;
  if (df <= 0) return null;
  const pooled = Math.sqrt(
    ((a.n - 1) * a.sd ** 2 + (b.n - 1) * b.sd ** 2) / df,
  );
  if (pooled === 0) return null;
  return (a.mean - b.mean) / pooled;
}

/**
 * For each tag, compare the mean **next-day** value of an outcome metric
 * (recovery, HRV, …) on tagged vs untagged days, with `n`, delta, and a simple
 * effect size (SPEC §5). A day is evaluable only when the following day has a
 * scored outcome; tagged days outside the metric's range are ignored so the two
 * groups are drawn from the same universe. Pure — the page joins recovery and
 * HRV drivers by tag for display. Results are sorted by tag for determinism.
 *
 * Small samples are surfaced (`lowConfidence`) rather than dropped, per the
 * spec's statistical-honesty guidance.
 */
export function tagDrivers(
  metric: DaySeries,
  tagDays: Map<string, Day[]>,
  { minN = DEFAULT_MIN_N }: { minN?: number } = {},
): TagDriver[] {
  // Outcome value observed *on* a given day (non-null only).
  const valueByDay = new Map<Day, number>();
  for (const point of metric) {
    if (point.value !== null) valueByDay.set(point.day, point.value);
  }

  // Universe = days whose *next* day carries a scored outcome.
  const universe = metric
    .map((point) => point.day)
    .filter((day) => valueByDay.has(nextDay(day)));
  const universeSet = new Set(universe);
  const nextValue = (day: Day) => valueByDay.get(nextDay(day)) as number;

  return [...tagDays.keys()].sort().map((tag) => {
    const tagged = new Set(
      (tagDays.get(tag) ?? []).filter((day) => universeSet.has(day)),
    );

    const taggedVals: number[] = [];
    const untaggedVals: number[] = [];
    for (const day of universe) {
      (tagged.has(day) ? taggedVals : untaggedVals).push(nextValue(day));
    }

    const t = meanStdev(taggedVals);
    const u = meanStdev(untaggedVals);
    const delta =
      t.mean !== null && u.mean !== null ? t.mean - u.mean : null;

    return {
      tag,
      taggedMean: t.mean,
      taggedN: t.n,
      untaggedMean: u.mean,
      untaggedN: u.n,
      delta,
      effectSize: cohensD(t, u),
      lowConfidence: t.n < minN,
    };
  });
}
