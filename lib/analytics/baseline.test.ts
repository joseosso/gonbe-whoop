import { describe, expect, it } from "vitest";

import { meanStdev, rollingBaseline } from "./baseline";
import type { DaySeries } from "./types";

/** Build a dense series over consecutive days from a list of values. */
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("meanStdev", () => {
  it("returns nulls for an empty input", () => {
    expect(meanStdev([])).toEqual({ mean: null, sd: null, n: 0 });
  });

  it("returns mean but null sd for a single value", () => {
    expect(meanStdev([5])).toEqual({ mean: 5, sd: null, n: 1 });
  });

  it("uses the sample (n − 1) standard deviation", () => {
    const { mean, sd, n } = meanStdev([2, 4]);
    expect(mean).toBe(3);
    expect(sd).toBeCloseTo(Math.SQRT2, 12); // variance = 2
    expect(n).toBe(2);
  });

  it("computes mean and sd over many values", () => {
    const { mean, sd } = meanStdev([1, 2, 3, 4, 5]);
    expect(mean).toBe(3);
    expect(sd).toBeCloseTo(Math.sqrt(2.5), 12);
  });
});

describe("rollingBaseline", () => {
  it("grows the window until it reaches `window`, then trails", () => {
    const out = rollingBaseline(series([1, 2, 3, 4, 5]), 3);
    expect(out.map((p) => p.mean)).toEqual([1, 1.5, 2, 3, 4]);
    expect(out.map((p) => p.n)).toEqual([1, 2, 3, 3, 3]);
    expect(out[0].sd).toBeNull(); // n = 1
    expect(out[2].sd).toBeCloseTo(1, 12); // [1,2,3]
  });

  it("skips null gaps within the window", () => {
    const out = rollingBaseline(series([1, null, 3]), 3);
    expect(out.map((p) => p.n)).toEqual([1, 1, 2]);
    expect(out[2].mean).toBe(2); // mean of [1, 3]
    expect(out[2].sd).toBeCloseTo(Math.SQRT2, 12);
  });

  it("handles an all-null window", () => {
    const out = rollingBaseline(series([null, null]), 2);
    expect(out).toEqual([
      { day: "2024-01-01", mean: null, sd: null, n: 0 },
      { day: "2024-01-02", mean: null, sd: null, n: 0 },
    ]);
  });

  it("rejects a window < 1", () => {
    expect(() => rollingBaseline(series([1]), 0)).toThrow(RangeError);
  });
});
