import { describe, expect, it } from "vitest";

import { isMeaningful, Z_THRESHOLD, zScore } from "./zscore";

describe("zScore", () => {
  it("computes (value − mean) / sd", () => {
    expect(zScore(10, { mean: 5, sd: 2 })).toBe(2.5);
    expect(zScore(6, { mean: 5, sd: 2 })).toBe(0.5);
  });

  it("returns null when the baseline is undefined", () => {
    expect(zScore(10, { mean: null, sd: 2 })).toBeNull();
    expect(zScore(10, { mean: 5, sd: null })).toBeNull();
  });

  it("returns null when sd is zero (no spread)", () => {
    expect(zScore(10, { mean: 5, sd: 0 })).toBeNull();
  });
});

describe("isMeaningful", () => {
  it("flags |z| at or above the threshold", () => {
    expect(isMeaningful(Z_THRESHOLD)).toBe(true);
    expect(isMeaningful(-2)).toBe(true);
    expect(isMeaningful(1.49)).toBe(false);
  });

  it("treats a null z-score as not meaningful", () => {
    expect(isMeaningful(null)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isMeaningful(1, 0.5)).toBe(true);
    expect(isMeaningful(1, 2)).toBe(false);
  });
});
