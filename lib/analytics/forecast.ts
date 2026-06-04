import { rollingBaseline } from "./baseline";
import { nextDay } from "./dates";
import { ewma } from "./ewma";
import type { Day, DaySeries } from "./types";
import { zScore } from "./zscore";

/**
 * Tomorrow's recovery forecast (Plan §4.3). A transparent, deterministic model —
 * not a trained one — so it stays pure and honest. Each driver we already
 * compute (today's strain, current sleep debt, ACWR, HRV EWMA slope) is z-scored
 * against its **own** personal baseline, then combined with signed weights into a
 * single "recovery pressure"; that maps back through the recovery baseline to a
 * predicted score and band. A `backtestForecast` over history reports MAE +
 * band-hit-rate so the forecast isn't over-claimed (SPEC §5 statistical honesty).
 */

export type RecoveryBand = "red" | "amber" | "green";

/** WHOOP recovery bands: 1–33 red, 34–66 amber, 67–100 green. */
export const RECOVERY_BANDS = { redMax: 33, amberMax: 66 } as const;

/** Map a recovery score (0–100) to its colour band. */
export function recoveryBand(score: number): RecoveryBand {
  if (score <= RECOVERY_BANDS.redMax) return "red";
  if (score <= RECOVERY_BANDS.amberMax) return "amber";
  return "green";
}

/** Baseline window for both the driver z-scores and the recovery mapping. */
export const FORECAST_WINDOW = 30;
/** Lookback (days) for the HRV EWMA slope. */
export const HRV_SLOPE_LAG = 7;

/** Driver weights (magnitudes sum to 1). HRV slope is favourable; rest adverse. */
export const FORECAST_WEIGHTS = {
  strain: 0.3,
  debt: 0.3,
  acwr: 0.15,
  hrvSlope: 0.25,
} as const;

export type DriverKey = keyof typeof FORECAST_WEIGHTS;

const DRIVER_LABELS: Record<DriverKey, string> = {
  strain: "Day strain",
  debt: "Sleep debt",
  acwr: "Training load",
  hrvSlope: "HRV trend",
};

/** Whether a *rise* in the driver lowers next-day recovery (adverse). */
const DRIVER_ADVERSE: Record<DriverKey, boolean> = {
  strain: true,
  debt: true,
  acwr: true,
  hrvSlope: false,
};

const DRIVER_KEYS = Object.keys(FORECAST_WEIGHTS) as DriverKey[];

/** Per-driver z-scores at the predictor day; `null` = the driver has no reading. */
export type DriverZ = Record<DriverKey, number | null>;

/** One driver's contribution to a forecast, for explainability. */
export interface DriverContribution {
  key: DriverKey;
  label: string;
  /** The driver's z vs its own trailing baseline. */
  z: number;
  /** Signed effect on predicted recovery, in SD units (+ raises, − lowers). */
  effect: number;
}

/** A weighted-score forecast and its drivers. */
export interface Forecast {
  /** Predicted recovery score (0–100), or `null` on thin history. */
  score: number | null;
  band: RecoveryBand | null;
  /** Combined downward pressure (+ lowers recovery); `null` when no drivers. */
  pressure: number | null;
  /** Contributing drivers, most influential first. */
  drivers: DriverContribution[];
}

/**
 * Combine driver z-scores into a predicted recovery score. The weighted mean of
 * the *present* drivers' signed z-scores is the recovery pressure (adverse
 * drivers push it up, the favourable HRV trend pulls it down); negating it gives
 * a predicted-recovery z, which the recovery baseline maps to a 0–100 score.
 * Missing drivers are dropped and the remaining weights renormalised, so a thin
 * day still forecasts from whatever it has.
 */
export function scoreFromDrivers(
  z: DriverZ,
  recovery: { mean: number | null; sd: number | null },
): Forecast {
  let num = 0;
  let wsum = 0;
  const present: { key: DriverKey; z: number; signedWeight: number }[] = [];
  for (const key of DRIVER_KEYS) {
    const zi = z[key];
    if (zi === null) continue;
    const weight = FORECAST_WEIGHTS[key];
    const signedWeight = DRIVER_ADVERSE[key] ? weight : -weight;
    num += signedWeight * zi;
    wsum += weight;
    present.push({ key, z: zi, signedWeight });
  }

  if (wsum === 0) return { score: null, band: null, pressure: null, drivers: [] };

  const pressure = num / wsum;
  const drivers: DriverContribution[] = present
    .map((p) => ({
      key: p.key,
      label: DRIVER_LABELS[p.key],
      z: p.z,
      effect: -(p.signedWeight * p.z) / wsum,
    }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  if (recovery.mean === null || recovery.sd === null || recovery.sd === 0) {
    return { score: null, band: null, pressure, drivers };
  }

  const score = Math.max(0, Math.min(100, recovery.mean + -pressure * recovery.sd));
  return { score, band: recoveryBand(score), pressure, drivers };
}

/** Per-day signed z of a densified series vs its trailing-window baseline. */
function zSeries(series: DaySeries, window: number): (number | null)[] {
  const base = rollingBaseline(series, window);
  return series.map((p, i) =>
    p.value === null ? null : zScore(p.value, base[i]),
  );
}

/** Per-day HRV EWMA slope (over `lag` days), normalised by the HRV baseline SD. */
function hrvSlopeZSeries(
  hrv: DaySeries,
  window: number,
  lag: number,
): (number | null)[] {
  const smoothed = ewma(hrv);
  const base = rollingBaseline(hrv, window);
  return hrv.map((_, i) => {
    const cur = smoothed[i].value;
    const prev = i - lag >= 0 ? smoothed[i - lag].value : null;
    const sd = base[i].sd;
    if (cur === null || prev === null || sd === null || sd === 0) return null;
    return (cur - prev) / sd;
  });
}

/** The densified, day-aligned driver series the forecast consumes. */
export interface ForecastInputs {
  /** Recovery score — both the mapping baseline and the backtest target. */
  recovery: DaySeries;
  strain: DaySeries;
  /** Sleep debt (any unit; z-scoring is scale-free). */
  debt: DaySeries;
  /** ACWR ratio. */
  acwr: DaySeries;
  /** Raw HRV (rMSSD); the EWMA + slope are derived here. */
  hrv: DaySeries;
}

/** A forecast anchored on predictor day `day`, for the recovery of `forDay`. */
export interface ForecastPoint extends Forecast {
  /** Predictor day d (the latest data feeding the forecast). */
  day: Day;
  /** The forecast target, d + 1. */
  forDay: Day;
}

/**
 * Build a per-day recovery forecast across the (densified, aligned) inputs: each
 * day d forecasts d + 1's recovery from drivers known by d. No target leakage —
 * every feature is drawn from day d or earlier. Returns one point per input day.
 */
export function buildForecast(
  inputs: ForecastInputs,
  { window = FORECAST_WINDOW, slopeLag = HRV_SLOPE_LAG } = {},
): ForecastPoint[] {
  const zStrain = zSeries(inputs.strain, window);
  const zDebt = zSeries(inputs.debt, window);
  const zAcwr = zSeries(inputs.acwr, window);
  const zHrvSlope = hrvSlopeZSeries(inputs.hrv, window, slopeLag);
  const recBase = rollingBaseline(inputs.recovery, window);

  return inputs.recovery.map((p, i) => {
    const forecast = scoreFromDrivers(
      {
        strain: zStrain[i],
        debt: zDebt[i],
        acwr: zAcwr[i],
        hrvSlope: zHrvSlope[i],
      },
      recBase[i],
    );
    return { day: p.day, forDay: nextDay(p.day), ...forecast };
  });
}

/** The latest forecast — the one predicting tomorrow's recovery. */
export function currentForecast(points: ForecastPoint[]): ForecastPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

/** Backtest accuracy of a run of forecasts against the recovery that followed. */
export interface BacktestResult {
  /** Forecasts that had both a predicted score and a real next-day recovery. */
  n: number;
  /** Mean absolute error of the predicted score (points), or `null` if n = 0. */
  mae: number | null;
  /** Fraction whose predicted band matched the actual band. */
  bandHitRate: number | null;
  /** Fraction within one band of the actual (a red↔green miss doesn't count). */
  withinOneBand: number | null;
}

const BAND_INDEX: Record<RecoveryBand, number> = { red: 0, amber: 1, green: 2 };

/**
 * Backtest forecasts against the recovery that actually followed. Only points
 * with a predicted score **and** a real `forDay` recovery count, so the latest
 * (tomorrow) forecast and thin-history nulls are excluded automatically.
 */
export function backtestForecast(
  points: ForecastPoint[],
  actualRecovery: DaySeries,
): BacktestResult {
  const actual = new Map(
    actualRecovery
      .filter((p): p is { day: Day; value: number } => p.value !== null)
      .map((p) => [p.day, p.value]),
  );

  let errSum = 0;
  let hits = 0;
  let near = 0;
  let n = 0;
  for (const point of points) {
    if (point.score === null || point.band === null) continue;
    const observed = actual.get(point.forDay);
    if (observed === undefined) continue;
    n += 1;
    errSum += Math.abs(point.score - observed);
    const actualBand = recoveryBand(observed);
    if (point.band === actualBand) hits += 1;
    if (Math.abs(BAND_INDEX[point.band] - BAND_INDEX[actualBand]) <= 1) near += 1;
  }

  if (n === 0) return { n: 0, mae: null, bandHitRate: null, withinOneBand: null };
  return { n, mae: errSum / n, bandHitRate: hits / n, withinOneBand: near / n };
}
