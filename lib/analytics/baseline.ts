import type { Day, DaySeries } from "./types";

/** Summary stats over a window. `mean`/`sd` are `null` when undefined. */
export interface Stats {
  mean: number | null;
  /** Sample standard deviation (n − 1); `null` when `n < 2`. */
  sd: number | null;
  n: number;
}

/** Per-day rolling baseline point. */
export type BaselinePoint = Stats & { day: Day };

/**
 * Sample mean and standard deviation (Bessel's n − 1 correction) over the given
 * numbers. Small-n guarded: `n = 0` → both `null`; `n = 1` → `mean` set, `sd`
 * `null` (SD is undefined for a single observation).
 */
export function meanStdev(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { mean: null, sd: null, n: 0 };

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  if (n < 2) return { mean, sd: null, n };

  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Personal baseline (SPEC §5): for each day, the mean ± SD over the trailing
 * `window` days **including** that day, with `null` values skipped. Pass a
 * densified series (see `densify`) so the positional window equals a calendar
 * window. `n` reports how many real observations backed each point.
 */
export function rollingBaseline(
  series: DaySeries,
  window: number,
): BaselinePoint[] {
  if (window < 1) throw new RangeError("window must be >= 1");

  return series.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const values = series
      .slice(start, i + 1)
      .map((p) => p.value)
      .filter((v): v is number => v !== null);
    return { day: point.day, ...meanStdev(values) };
  });
}
