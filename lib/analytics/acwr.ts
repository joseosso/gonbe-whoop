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

// --- Safe-strain budget (forward ACWR what-if) ----------------------------
//
// The gauge above is diagnostic (where ACWR sits now). The budget is
// prescriptive: how much strain can today absorb before ACWR leaves the sweet
// spot? We model today's strain `S` as one new observation entering *both*
// windows, so end-of-day means are `(S + sum)/(n + 1)`.

/** WHOOP's strain scale tops out at 21; budgets above this mean full headroom. */
export const WHOOP_STRAIN_MAX = 21;

/** Trailing strain totals over the days **before** today, per window. */
export interface PriorLoads {
  /** Σ strain over the `acuteWindow − 1` days before today. */
  acuteSum: number;
  /** Real (non-null) days in that acute lookback. */
  acuteN: number;
  /** Σ strain over the `chronicWindow − 1` days before today. */
  chronicSum: number;
  /** Real (non-null) days in that chronic lookback. */
  chronicN: number;
}

/**
 * Prior acute/chronic strain totals for a **densified** strain series whose last
 * point is "today" (the day being planned). Today's own value is excluded — the
 * budget treats today's strain as the free variable. `null` days are skipped, so
 * the sums pair with their real-day counts.
 */
export function priorLoads(
  strain: DaySeries,
  {
    acuteWindow = 7,
    chronicWindow = 28,
  }: { acuteWindow?: number; chronicWindow?: number } = {},
): PriorLoads {
  const before = strain.slice(0, -1); // drop today
  const tally = (n: number) => {
    let sum = 0;
    let count = 0;
    for (const p of before.slice(Math.max(0, before.length - n))) {
      if (p.value !== null) {
        sum += p.value;
        count += 1;
      }
    }
    return { sum, count };
  };
  const a = tally(acuteWindow - 1);
  const b = tally(chronicWindow - 1);
  return {
    acuteSum: a.sum,
    acuteN: a.count,
    chronicSum: b.sum,
    chronicN: b.count,
  };
}

/**
 * End-of-day ACWR if today accrues `strain`, given the prior loads. `strain`
 * enters both windows as one new observation. `null` when the chronic mean
 * would be 0 (no history/load).
 */
export function projectAcwr(strain: number, prior: PriorLoads): number | null {
  const acuteMean = (prior.acuteSum + strain) / (prior.acuteN + 1);
  const chronicMean = (prior.chronicSum + strain) / (prior.chronicN + 1);
  if (chronicMean === 0) return null;
  return acuteMean / chronicMean;
}

/**
 * The maximum day-strain that keeps end-of-day ACWR ≤ `targetRatio` (default
 * the top of the sweet spot). Solving `k(S+a) = T(S+b)` for `S` gives
 * `S = (T·b − k·a)/(k − T)` with `k = (nb+1)/(na+1)`. Clamped at 0 (already at
 * or above target → no budget). `null` when `k ≤ T` — too little history to
 * bound a single day's contribution.
 */
export function strainBudget(
  prior: PriorLoads,
  targetRatio: number = ACWR_BANDS.optimalMax,
): number | null {
  const na1 = prior.acuteN + 1;
  const nb1 = prior.chronicN + 1;
  const k = nb1 / na1;
  if (k <= targetRatio) return null;
  const s = (targetRatio * prior.chronicSum - k * prior.acuteSum) / (k - targetRatio);
  return Math.max(0, s);
}
