import { rollingBaseline } from "./baseline";
import type { Day, DaySeries } from "./types";

/**
 * Acute:Chronic Workload Ratio status bands (SPEC §5). Sweet spot is 0.8–1.3;
 * a ratio above 1.5 is an elevated-risk spike. The 1.3–1.5 shoulder is a
 * caution zone, and below 0.8 is detraining/undertraining.
 */
export type AcwrStatus = "low" | "optimal" | "high" | "elevated";

export const ACWR_BANDS = {
  /** Below this: undertraining (`low`). */
  lowMax: 0.8,
  /** Up to this: the sweet spot (`optimal`). */
  optimalMax: 1.3,
  /** Up to this: caution (`high`); above it is `elevated`. */
  highMax: 1.5,
} as const;

/** Map an ACWR ratio to its status band. */
export function acwrStatus(ratio: number): AcwrStatus {
  if (ratio < ACWR_BANDS.lowMax) return "low";
  if (ratio <= ACWR_BANDS.optimalMax) return "optimal";
  if (ratio <= ACWR_BANDS.highMax) return "high";
  return "elevated";
}

/** One day's acute/chronic strain loads and their ratio. */
export interface AcwrPoint {
  day: Day;
  /** Mean daily strain over the trailing acute window (default 7 days). */
  acute: number | null;
  /** Mean daily strain over the trailing chronic window (default 28 days). */
  chronic: number | null;
  /** Real (non-null) days backing the chronic window — guards thin history. */
  chronicN: number;
  /** `acute ÷ chronic`; `null` when either is undefined or chronic is 0. */
  ratio: number | null;
  status: AcwrStatus | null;
}

/**
 * Acute:Chronic Workload Ratio over time (SPEC §5): the trailing acute-window
 * mean strain divided by the trailing chronic-window mean. Pass a **densified**
 * strain series (one point per calendar day) so the positional windows equal
 * calendar windows; `null` days are skipped within each window. The ratio is
 * `null` until there's enough history for both means.
 */
export function acwrSeries(
  strain: DaySeries,
  {
    acuteWindow = 7,
    chronicWindow = 28,
  }: { acuteWindow?: number; chronicWindow?: number } = {},
): AcwrPoint[] {
  const acute = rollingBaseline(strain, acuteWindow);
  const chronic = rollingBaseline(strain, chronicWindow);

  return strain.map((point, i) => {
    const a = acute[i].mean;
    const c = chronic[i].mean;
    const ratio = a !== null && c !== null && c !== 0 ? a / c : null;
    return {
      day: point.day,
      acute: a,
      chronic: c,
      chronicN: chronic[i].n,
      ratio,
      status: ratio === null ? null : acwrStatus(ratio),
    };
  });
}

/** The most recent point with a computable ratio, or `null` if none. */
export function currentAcwr(points: AcwrPoint[]): AcwrPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].ratio !== null) return points[i];
  }
  return null;
}
