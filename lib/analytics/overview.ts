import { meanStdev, type Stats } from "./baseline";
import type { Day, DaySeries } from "./types";
import { isMeaningful, zScore } from "./zscore";

/** Default baseline window for the Overview cards (SPEC §5 personal baseline). */
export const OVERVIEW_WINDOW = 30;

/** Latest value vs its trailing baseline, with the z-score flag. */
export interface MetricSummary {
  /** Most recent non-null point in the series, or `null` if none. */
  latest: { day: Day; value: number } | null;
  /** Baseline over the `window` days **preceding** `latest` (excludes it). */
  baseline: Stats;
  z: number | null;
  meaningful: boolean;
}

/**
 * Summarize a (densified) day series for an Overview card: take the latest
 * real value and score it against the baseline of the `window` days before it.
 * Excluding the latest day keeps it from biasing its own baseline. Pass a
 * densified series so the window is a calendar window.
 */
export function summarizeMetric(
  series: DaySeries,
  window = OVERVIEW_WINDOW,
): MetricSummary {
  let i = series.length - 1;
  while (i >= 0 && series[i].value === null) i--;

  if (i < 0) {
    return {
      latest: null,
      baseline: { mean: null, sd: null, n: 0 },
      z: null,
      meaningful: false,
    };
  }

  const latest = { day: series[i].day, value: series[i].value as number };
  const prior = series
    .slice(Math.max(0, i - window), i)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  const baseline = meanStdev(prior);
  const z = zScore(latest.value, baseline);
  return { latest, baseline, z, meaningful: isMeaningful(z) };
}
