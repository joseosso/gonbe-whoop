import { shiftDay } from "./dates";
import type { DaySeries } from "./types";

/**
 * Auto driver-discovery via lagged correlation (Plan §4.5). Generalises the
 * tag-driver idea to any predictor → outcome pair at a configurable lag (e.g.
 * yesterday's strain → today's recovery). Pearson `r` with the paired `n`, an
 * approximate two-sided p-value (Fisher z), and a low-confidence guard so thin
 * or non-significant relationships are surfaced honestly rather than over-claimed
 * (SPEC §5). Pure — the Insights page assembles the series and ranks the output.
 */

/** Below this many paired observations, a correlation is low-confidence. */
export const CORR_MIN_N = 8;
/** Two-sided significance level for the confidence guard. */
export const CORR_ALPHA = 0.05;

/** A correlation result with its honesty guards. */
export interface Correlation {
  /** Pearson r ∈ [−1, 1], or `null` when undefined (no variance / too few). */
  r: number | null;
  /** Paired (both-non-null) observations backing `r`. */
  n: number;
  /** Approximate two-sided p-value (Fisher z), or `null` when not computable. */
  pValue: number | null;
  /** `n < minN` or not significant at `alpha` — interpret with caution. */
  lowConfidence: boolean;
}

/**
 * Pair predictor `x` on day d with outcome `y` on day d + `lag`, keeping only
 * days where both are present. The predictor is the earlier term, so a positive
 * lag means it precedes the outcome: `lag = 1` correlates a day's predictor with
 * the **next** day's outcome (e.g. yesterday's strain → today's recovery), and
 * `lag = 0` is same-day.
 */
export function lagPairs(
  x: DaySeries,
  y: DaySeries,
  lag: number,
): [number, number][] {
  const yByDay = new Map<string, number>();
  for (const p of y) if (p.value !== null) yByDay.set(p.day, p.value);

  const pairs: [number, number][] = [];
  for (const p of x) {
    if (p.value === null) continue;
    const yv = yByDay.get(shiftDay(p.day, lag));
    if (yv !== undefined) pairs.push([p.value, yv]);
  }
  return pairs;
}

/** Pearson correlation over paired values; `r` is `null` when a side is flat. */
export function pearson(pairs: [number, number][]): {
  r: number | null;
  n: number;
} {
  const n = pairs.length;
  if (n < 2) return { r: null, n };

  let mx = 0;
  let my = 0;
  for (const [x, y] of pairs) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: null, n }; // no variance → undefined
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

/** Standard normal CDF via an Abramowitz–Stegun erf approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Approximate two-sided p-value for a correlation `r` over `n` pairs, via the
 * Fisher z-transform (`atanh(r)·√(n−3)` ~ standard normal under H₀). `null` when
 * `n < 4` or `|r| = 1` (the transform diverges).
 */
export function correlationPValue(r: number, n: number): number | null {
  if (n < 4 || Math.abs(r) >= 1) return null;
  const z = Math.atanh(r) * Math.sqrt(n - 3);
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/** Correlate predictor `x` against outcome `y` at `lag`, with honesty guards. */
export function correlate(
  x: DaySeries,
  y: DaySeries,
  lag: number,
  { minN = CORR_MIN_N, alpha = CORR_ALPHA }: { minN?: number; alpha?: number } = {},
): Correlation {
  const { r, n } = pearson(lagPairs(x, y, lag));
  const pValue = r === null ? null : correlationPValue(r, n);
  const significant = pValue !== null && pValue < alpha;
  return { r, n, pValue, lowConfidence: n < minN || !significant };
}

/** A candidate predictor of an outcome, with its lag. */
export interface DriverSpec {
  key: string;
  /** Human label for the predictor. */
  label: string;
  /** Predictor day series. */
  series: DaySeries;
  /** Days the predictor precedes the outcome (≥ 0). */
  lag: number;
  /** Optional note, e.g. "later bedtime". */
  hint?: string;
}

/** A ranked driver: its correlation with the shared outcome plus its identity. */
export interface DriverCorrelation extends Correlation, DriverSpec {}

/**
 * Correlate every predictor spec against a shared `outcome` and rank by absolute
 * effect size (strongest first). Specs whose correlation is undefined (no
 * variance / too few pairs) are dropped; the rest keep their low-confidence
 * guard so the UI can flag weak evidence rather than hide it.
 */
export function rankDrivers(
  outcome: DaySeries,
  specs: DriverSpec[],
  opts: { minN?: number; alpha?: number } = {},
): DriverCorrelation[] {
  return specs
    .map((spec) => ({ ...spec, ...correlate(spec.series, outcome, spec.lag, opts) }))
    .filter((d): d is DriverCorrelation => d.r !== null)
    .sort((a, b) => Math.abs(b.r as number) - Math.abs(a.r as number));
}
