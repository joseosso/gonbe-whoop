import type { WorkoutRow } from "./types";

/**
 * Polarized-training / zone-distribution analyzer (Plan §5.4). Aggregates the
 * per-workout HR-zone durations (`zone0..5_milli`) across the selected range,
 * normalizes to percent time per zone, then folds WHOOP's six zones into the
 * three polarized intensity bands and compares them to the Seiler 80/20 target —
 * flagging the "gray zone" (threshold no-man's-land) when too much volume lands
 * there. Pure aggregation; honest about how much total time was analyzed.
 */

/** WHOOP HR zones, low → max. */
export const ZONE_COUNT = 6;

/** The three polarized intensity bands. */
export type IntensityBand = "low" | "gray" | "high";

export const BANDS: readonly IntensityBand[] = ["low", "gray", "high"] as const;

/**
 * Which WHOOP zones (0–5) compose each polarized band, by %HRmax thresholds:
 * below the aerobic threshold (~80% HRmax, WHOOP Z0–3) is easy aerobic work;
 * the threshold "no-man's-land" between the aerobic and anaerobic thresholds
 * (~80–90%, WHOOP Z4) is the gray zone to minimize; above the anaerobic
 * threshold (~90%, WHOOP Z5) is genuinely hard. Whole-zone granularity, so the
 * boundaries are approximations.
 */
export const BAND_ZONES: Record<IntensityBand, readonly number[]> = {
  low: [0, 1, 2, 3],
  gray: [4],
  high: [5],
};

/** Seiler polarized reference: most volume easy, little threshold, some hard. */
export const POLARIZED_TARGET: Record<IntensityBand, number> = {
  low: 0.8,
  gray: 0.05,
  high: 0.15,
};

/** Above this gray-zone share, training is flagged stuck in no-man's-land. */
export const GRAY_ZONE_FLAG = 0.1;

const MS_PER_MIN = 60_000;

/** A workout reduced to its HR-zone durations. `WorkoutRow` satisfies this. */
export type ZoneWorkout = Pick<WorkoutRow, "zoneMilli">;

/** The aggregated zone distribution over a set of workouts. */
export interface ZoneDistribution {
  /** Total zone time analyzed (minutes) across all workouts. */
  totalMinutes: number;
  /** Per-WHOOP-zone minutes (index 0–5). */
  zoneMinutes: number[];
  /** Per-WHOOP-zone share of total (0–1); all 0 when there is no time. */
  zoneShare: number[];
  /** Per-band minutes. */
  bandMinutes: Record<IntensityBand, number>;
  /** Per-band share of total (0–1); all 0 when there is no time. */
  bandShare: Record<IntensityBand, number>;
  /** Gray-zone share exceeds the flag threshold. */
  grayZoneFlagged: boolean;
  /** No zone time at all — nothing to analyze. */
  empty: boolean;
}

/**
 * Sum HR-zone durations across workouts and report per-zone / per-band shares
 * against the polarized target. `null` zone durations count as zero; a workout
 * with no zone time contributes nothing. Shares are `0` (not `NaN`) when there
 * is no time at all.
 */
export function zoneDistribution(
  workouts: ZoneWorkout[],
  { grayZoneFlag = GRAY_ZONE_FLAG }: { grayZoneFlag?: number } = {},
): ZoneDistribution {
  const zoneMs = new Array<number>(ZONE_COUNT).fill(0);
  for (const w of workouts) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      zoneMs[z] += w.zoneMilli[z] ?? 0;
    }
  }

  const totalMs = zoneMs.reduce((sum, ms) => sum + ms, 0);
  const empty = totalMs === 0;
  const share = (ms: number) => (empty ? 0 : ms / totalMs);

  const bandMs = (band: IntensityBand) =>
    BAND_ZONES[band].reduce((sum, z) => sum + zoneMs[z], 0);

  const bandMinutes = {
    low: bandMs("low") / MS_PER_MIN,
    gray: bandMs("gray") / MS_PER_MIN,
    high: bandMs("high") / MS_PER_MIN,
  };
  const bandShare = {
    low: share(bandMs("low")),
    gray: share(bandMs("gray")),
    high: share(bandMs("high")),
  };

  return {
    totalMinutes: totalMs / MS_PER_MIN,
    zoneMinutes: zoneMs.map((ms) => ms / MS_PER_MIN),
    zoneShare: zoneMs.map(share),
    bandMinutes,
    bandShare,
    grayZoneFlagged: !empty && bandShare.gray > grayZoneFlag,
    empty,
  };
}
