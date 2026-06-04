import { describe, expect, it } from "vitest";

import { regularityIndex, type ClockTimes } from "./regularity";

const nights = (rows: [number, number][]): ClockTimes[] =>
  rows.map(([bedMinute, wakeMinute]) => ({ bedMinute, wakeMinute }));

describe("regularityIndex", () => {
  it("scores identical times as perfectly regular (100)", () => {
    const r = regularityIndex(nights([
      [1380, 420],
      [1380, 420],
      [1380, 420],
    ]));
    expect(r.bedR).toBeCloseTo(1, 10);
    expect(r.wakeR).toBeCloseTo(1, 10);
    expect(r.index).toBeCloseTo(100, 10);
  });

  it("scores antipodal times as 0", () => {
    // bed at 00:00 vs 12:00, wake at 06:00 vs 18:00 — opposite on the circle.
    const r = regularityIndex(nights([
      [0, 360],
      [720, 1080],
    ]));
    expect(r.index).toBeCloseTo(0, 10);
  });

  it("treats midnight wraparound as close, not 24h apart", () => {
    // 23:50 and 00:10 are 20 minutes apart across midnight.
    const r = regularityIndex(nights([
      [1430, 420],
      [10, 420],
    ]));
    expect(r.bedR!).toBeGreaterThan(0.99);
  });

  it("returns null below the minimum sample size", () => {
    const r = regularityIndex(nights([[1380, 420]]));
    expect(r.index).toBeNull();
    expect(r.n).toBe(1);
  });
});
