import { densify } from "./dates";
import { OVERVIEW_WINDOW, summarizeMetric } from "./overview";
import type { Day, DayRange, DaySeries, RecoveryDay, SleepDay } from "./types";
import { Z_THRESHOLD } from "./zscore";

/**
 * Illness & strain early-warning radar (Plan §4.2). Fuses the per-night
 * body-stress signals — skin temp ↑, resting HR ↑, HRV ↓, respiratory rate ↑,
 * SpO2 ↓ — each scored against its **own** trailing baseline (reusing
 * `summarizeMetric`'s 30-day window + z-score). A day is flagged when ≥ 2
 * signals breach `|z| ≥ 1.5` in the adverse direction; severity scales with the
 * count. The contributing signals are surfaced so the read is explainable, not a
 * black box, and the result feeds an Overview card and the weekly digest (§2.5).
 */

/** The direction in which a signal's deviation is physiologically adverse. */
export type AdverseDirection = "high" | "low";

/** Fused status: `ok` (< 2 breaches), `watch` (2), `alert` (≥ 3). */
export type RadarStatus = "ok" | "watch" | "alert";

/** ≥ this many adverse breaches flags the day (`watch`). */
export const RADAR_FLAG_MIN = 2;
/** ≥ this many adverse breaches escalates to `alert`. */
export const RADAR_ALERT_MIN = 3;

/** One body-stress signal feeding the radar. */
export interface RadarSignal {
  /** Stable key (e.g. `"hrv"`). */
  key: string;
  /** Human label for the UI. */
  label: string;
  /** Densified per-day series (one point per calendar day; see `densify`). */
  series: DaySeries;
  /** Which direction is adverse: skin temp/RHR/resp rate ↑, HRV/SpO2 ↓. */
  adverse: AdverseDirection;
}

/** Per-signal radar reading: the latest value vs its own trailing baseline. */
export interface SignalReading {
  key: string;
  label: string;
  adverse: AdverseDirection;
  /** Latest non-null value, or `null` if the signal has no data in range. */
  value: number | null;
  /** Signed z vs the trailing baseline (positive = above baseline). */
  z: number | null;
  /** Z in the adverse direction (`+` = worse); `null` when `z` is null. */
  adverseZ: number | null;
  /** True when the signal breaches the threshold in its adverse direction. */
  breached: boolean;
}

/** The fused radar reading for the most recent day. */
export interface RadarResult {
  /** Most recent day backing any signal, or `null` when there's no data. */
  day: Day | null;
  /** One reading per signal, in input order, for the radar plot. */
  readings: SignalReading[];
  /** Breached signals, most adverse first — the explainable drivers. */
  drivers: SignalReading[];
  /** Count of signals breaching in the adverse direction. */
  breachCount: number;
  status: RadarStatus;
}

/** Whether a signed z breaches the threshold in the adverse direction. */
function adverseBreach(
  z: number | null,
  adverse: AdverseDirection,
  threshold: number,
): boolean {
  if (z === null) return false;
  return adverse === "high" ? z >= threshold : z <= -threshold;
}

function statusFor(breachCount: number): RadarStatus {
  if (breachCount >= RADAR_ALERT_MIN) return "alert";
  if (breachCount >= RADAR_FLAG_MIN) return "watch";
  return "ok";
}

/**
 * Fuse the body-stress signals into one early-warning reading. Each signal's
 * latest value is scored against the baseline of the `window` days **before** it
 * (via `summarizeMetric`, so a flat baseline → `z = null` rather than infinity).
 * Direction-aware: only deviations in the adverse direction count toward a flag.
 */
export function buildRadar(
  signals: RadarSignal[],
  {
    window = OVERVIEW_WINDOW,
    threshold = Z_THRESHOLD,
  }: { window?: number; threshold?: number } = {},
): RadarResult {
  const readings: SignalReading[] = signals.map((s) => {
    const { latest, z } = summarizeMetric(s.series, window);
    const adverseZ = z === null ? null : s.adverse === "high" ? z : -z;
    return {
      key: s.key,
      label: s.label,
      adverse: s.adverse,
      value: latest?.value ?? null,
      z,
      adverseZ,
      breached: adverseBreach(z, s.adverse, threshold),
    };
  });

  const drivers = readings
    .filter((r) => r.breached)
    .sort((a, b) => (b.adverseZ as number) - (a.adverseZ as number));

  // Anchor the result on the most recent day any signal has data for.
  const day = signals.reduce<Day | null>((acc, s) => {
    const last = [...s.series].reverse().find((p) => p.value !== null);
    if (!last) return acc;
    return acc === null || last.day > acc ? last.day : acc;
  }, null);

  const breachCount = drivers.length;
  return { day, readings, drivers, breachCount, status: statusFor(breachCount) };
}

/**
 * Build the five radar signals from recovery + sleep series over a range — the
 * single source of truth for which metrics feed the radar and their adverse
 * directions. Respiratory rate comes from sleep; the rest from recovery. Series
 * are densified so each signal's baseline window is a calendar window.
 */
export function buildRadarSignals(
  recovery: RecoveryDay[],
  sleep: SleepDay[],
  range: DayRange,
): RadarSignal[] {
  const rec = (pick: (r: RecoveryDay) => number | null): DaySeries =>
    densify(
      recovery.map((r) => ({ day: r.day, value: pick(r) })),
      range,
    );
  return [
    { key: "skinTemp", label: "Skin temp", adverse: "high", series: rec((r) => r.skinTempC) },
    { key: "restingHr", label: "Resting HR", adverse: "high", series: rec((r) => r.restingHr) },
    { key: "hrv", label: "HRV", adverse: "low", series: rec((r) => r.hrvRmssdMilli) },
    { key: "spo2", label: "SpO₂", adverse: "low", series: rec((r) => r.spo2) },
    {
      key: "respRate",
      label: "Respiratory rate",
      adverse: "high",
      series: densify(
        sleep.map((s) => ({ day: s.day, value: s.respiratoryRate })),
        range,
      ),
    },
  ];
}
