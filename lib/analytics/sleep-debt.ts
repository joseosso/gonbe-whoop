import type { Day } from "./types";

/** A night's sleep need vs. what you actually slept (both in millis). */
export interface SleepNight {
  day: Day;
  needMilli: number | null;
  actualMilli: number | null;
}

/** Trailing sleep-debt point: cumulative deficit over the window. */
export interface SleepDebtPoint {
  day: Day;
  /** `Σ(need − actual)` over the window; positive = under-slept. `null` if no nights. */
  debtMilli: number | null;
  /** Number of scored nights backing this point. */
  nights: number;
}

/** Default sleep-debt accumulation window (SPEC §5: trailing 14 days). */
export const SLEEP_DEBT_WINDOW = 14;

/**
 * Trailing sleep debt (SPEC §5): for each day, `Σ(need − actual)` over the
 * trailing `window` nights, counting only nights with both values present.
 * Pass a dense per-day array (one entry per calendar day, nulls for nights with
 * no sleep) so the window is a calendar window. Debt can be negative (you
 * banked sleep). `debtMilli` is `null` when the window holds no scored nights.
 */
export function sleepDebt(
  nights: SleepNight[],
  window = SLEEP_DEBT_WINDOW,
): SleepDebtPoint[] {
  if (window < 1) throw new RangeError("window must be >= 1");

  return nights.map((night, i) => {
    let debt = 0;
    let count = 0;
    for (const n of nights.slice(Math.max(0, i - window + 1), i + 1)) {
      if (n.needMilli !== null && n.actualMilli !== null) {
        debt += n.needMilli - n.actualMilli;
        count += 1;
      }
    }
    return {
      day: night.day,
      debtMilli: count === 0 ? null : debt,
      nights: count,
    };
  });
}
