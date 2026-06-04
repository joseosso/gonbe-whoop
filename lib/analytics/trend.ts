import { rollingBaseline } from "./baseline";
import { densify } from "./dates";
import { ewma } from "./ewma";
import type { DayRange, DaySeries } from "./types";

/** One day on a trend chart: raw value, EWMA, and the baseline ± SD band. */
export interface TrendPoint {
  day: string;
  raw: number | null;
  ewma: number | null;
  /** `[mean − sd, mean + sd]` for the day, or `null` when no baseline. */
  band: [number, number] | null;
}

/**
 * Prepare a metric series for a trend chart (SPEC §5): raw values, an EWMA
 * overlay, and a trailing baseline ± SD band. Runs server-side (pure) so the
 * chart component stays presentational. Densifies first so the window and the
 * x-axis are calendar-aligned.
 */
export function buildTrend(
  series: DaySeries,
  range: DayRange,
  { window = 30, alpha = 0.2 }: { window?: number; alpha?: number } = {},
): TrendPoint[] {
  const dense = densify(series, range);
  const baseline = rollingBaseline(dense, window);
  const smoothed = ewma(dense, alpha);

  return dense.map((point, i) => {
    const { mean, sd } = baseline[i];
    return {
      day: point.day,
      raw: point.value,
      ewma: smoothed[i].value,
      band: mean === null ? null : [mean - (sd ?? 0), mean + (sd ?? 0)],
    };
  });
}
