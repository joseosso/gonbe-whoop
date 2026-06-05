import { describe, expect, it } from "vitest";

import type { ZoneWorkout } from "./zone-distribution";
import { zoneDistribution } from "./zone-distribution";

const MIN = 60_000;

/** Build a workout from six per-zone minute values (nulls allowed). */
const wk = (...minutes: (number | null)[]): ZoneWorkout => ({
  zoneMilli: minutes.map((m) => (m === null ? null : m * MIN)) as ZoneWorkout["zoneMilli"],
});

describe("zoneDistribution", () => {
  it("sums zone time across workouts and normalizes to shares", () => {
    // Two workouts; totals per zone: [20, 10, 10, 0, 0, 0] min → 40 min total.
    const out = zoneDistribution([
      wk(10, 10, 0, 0, 0, 0),
      wk(10, 0, 10, 0, 0, 0),
    ]);
    expect(out.totalMinutes).toBe(40);
    expect(out.zoneMinutes).toEqual([20, 10, 10, 0, 0, 0]);
    expect(out.zoneShare[0]).toBeCloseTo(0.5);
    expect(out.zoneShare[1]).toBeCloseTo(0.25);
    expect(out.empty).toBe(false);
  });

  it("folds the six zones into low/gray/high bands", () => {
    // low = Z0–3 (60), gray = Z4 (20), high = Z5 (20) → 100 min total.
    const out = zoneDistribution([wk(30, 10, 10, 10, 20, 20)]);
    expect(out.bandMinutes).toEqual({ low: 60, gray: 20, high: 20 });
    expect(out.bandShare.low).toBeCloseTo(0.6);
    expect(out.bandShare.gray).toBeCloseTo(0.2);
    expect(out.bandShare.high).toBeCloseTo(0.2);
  });

  it("flags an over-large gray zone, passes a polarized split", () => {
    // 20% gray > 10% threshold → flagged.
    expect(zoneDistribution([wk(60, 0, 0, 0, 20, 20)]).grayZoneFlagged).toBe(
      true,
    );
    // 80/5/15 polarized → under threshold, not flagged.
    expect(
      zoneDistribution([wk(80, 0, 0, 0, 5, 15)]).grayZoneFlagged,
    ).toBe(false);
  });

  it("respects a custom gray-zone flag threshold", () => {
    const split = [wk(80, 0, 0, 0, 8, 12)];
    expect(zoneDistribution(split, { grayZoneFlag: 0.05 }).grayZoneFlagged).toBe(
      true,
    );
    expect(zoneDistribution(split, { grayZoneFlag: 0.1 }).grayZoneFlagged).toBe(
      false,
    );
  });

  it("treats null zone durations as zero (partial-zone guard)", () => {
    const out = zoneDistribution([wk(10, null, null, null, null, 10)]);
    expect(out.totalMinutes).toBe(20);
    expect(out.bandMinutes.low).toBe(10);
    expect(out.bandMinutes.high).toBe(10);
  });

  it("guards empty input with zero shares, never NaN", () => {
    const out = zoneDistribution([]);
    expect(out.empty).toBe(true);
    expect(out.totalMinutes).toBe(0);
    expect(out.zoneShare).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out.bandShare).toEqual({ low: 0, gray: 0, high: 0 });
    expect(out.grayZoneFlagged).toBe(false);
  });

  it("treats all-null / all-zero workouts as empty", () => {
    const out = zoneDistribution([wk(0, 0, 0, 0, 0, 0), wk(null, null, null, null, null, null)]);
    expect(out.empty).toBe(true);
    expect(out.grayZoneFlagged).toBe(false);
  });
});
