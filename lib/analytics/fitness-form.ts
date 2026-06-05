import { ewma } from "./ewma";
import type { Day, DaySeries } from "./types";

/**
 * Fitness–Fatigue–Form model (Plan §5.2) — the TrainingPeaks CTL/ATL/TSB concept
 * applied to WHOOP daily strain, which the WHOOP app doesn't surface.
 *
 *   Fitness (CTL) = slow EWMA of strain (long time constant) — accumulated load.
 *   Fatigue (ATL) = fast EWMA of strain (short time constant) — recent load.
 *   Form    (TSB) = Fitness − Fatigue — freshness: positive = fresh & adapted,
 *                   negative = carrying fatigue.
 *
 * Pure and null-gap aware (reuses `ewma`). Pass a **densified** strain series so
 * the EWMA time constants are calendar days, not just present observations.
 */

/** Default time constants (days): the classic 42-day fitness / 7-day fatigue. */
export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

/**
 * Form deadband as a fraction of Fitness. Strain-scale Form is small (±a few
 * points), so a fixed threshold doesn't transfer between athletes; scaling the
 * neutral band to each person's fitness keeps the status self-calibrating.
 */
export const FORM_DEADBAND_FRAC = 0.1;

/**
 * Absolute floor (strain points) for the deadband. Without it the band collapses
 * toward zero on low-load weeks (fitness ≈ 0), making the status flip on trivial
 * noise; this keeps it stable when there's barely any load to balance.
 */
export const FORM_DEADBAND_MIN = 0.5;

/**
 * EWMA smoothing factor for an exponential time constant of `days`: the standard
 * CTL/ATL definition `α = 1 − e^(−1/days)` (an N-day exponential impulse
 * response), not the `2/(N+1)` SMA-equivalent.
 */
export const alphaFor = (days: number): number => {
  if (!(days > 0)) throw new RangeError("days must be > 0");
  return 1 - Math.exp(-1 / days);
};

/** One day's fitness / fatigue / form. All `null` on a day with no strain. */
export interface FormPoint {
  day: Day;
  /** Slow EWMA of strain (accumulated fitness). */
  fitness: number | null;
  /** Fast EWMA of strain (recent fatigue). */
  fatigue: number | null;
  /** `fitness − fatigue`; positive = fresh, negative = fatigued. */
  form: number | null;
}

/** Freshness band for the latest (or any) form reading. */
export type FormStatus = "fresh" | "neutral" | "fatigued";

/**
 * Per-day fitness, fatigue, and form over a densified strain series. Both EWMAs
 * skip `null` days identically, so `form` is defined exactly on days with strain.
 */
export function fitnessForm(
  strain: DaySeries,
  {
    fitnessDays = FITNESS_DAYS,
    fatigueDays = FATIGUE_DAYS,
  }: { fitnessDays?: number; fatigueDays?: number } = {},
): FormPoint[] {
  const fit = ewma(strain, alphaFor(fitnessDays));
  const fat = ewma(strain, alphaFor(fatigueDays));
  return strain.map((p, i) => {
    const fitness = fit[i].value;
    const fatigue = fat[i].value;
    return {
      day: p.day,
      fitness,
      fatigue,
      form: fitness !== null && fatigue !== null ? fitness - fatigue : null,
    };
  });
}

/**
 * Classify a form reading. The neutral deadband is `±frac · fitness`, so the
 * status scales to the athlete's own load rather than an absolute strain cutoff.
 * `null` when the point has no form (thin/gap day).
 */
export function formStatus(
  point: FormPoint,
  frac: number = FORM_DEADBAND_FRAC,
): FormStatus | null {
  if (point.form === null || point.fitness === null) return null;
  const band = Math.max(FORM_DEADBAND_MIN, Math.abs(point.fitness) * frac);
  if (point.form > band) return "fresh";
  if (point.form < -band) return "fatigued";
  return "neutral";
}

/** The most recent point with a computable form, or `null` if none. */
export function currentForm(points: FormPoint[]): FormPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].form !== null) return points[i];
  }
  return null;
}
