import { describe, expect, it } from "vitest";

import { summarizeMetric } from "./overview";
import type { DaySeries } from "./types";

const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("summarizeMetric", () => {
  it("returns an empty summary for an all-null series", () => {
    const s = summarizeMetric(series([null, null]));
    expect(s.latest).toBeNull();
    expect(s.baseline).toEqual({ mean: null, sd: null, n: 0 });
    expect(s.z).toBeNull();
    expect(s.meaningful).toBe(false);
  });

  it("scores the latest value against the preceding window", () => {
    // baseline = days before the last: mean 5, sd 0 → z null (no spread).
    const s = summarizeMetric(series([5, 5, 5, 9]), 30);
    expect(s.latest).toEqual({ day: "2024-01-04", value: 9 });
    expect(s.baseline.mean).toBe(5);
    expect(s.baseline.sd).toBe(0);
    expect(s.z).toBeNull(); // sd 0 → undefined deviation
  });

  it("flags a meaningful deviation and excludes the latest from baseline", () => {
    // prior [10,12,14,16] → mean 13, sd ≈ 2.58; latest 20 → z ≈ 2.71 ≥ 1.5.
    const s = summarizeMetric(series([10, 12, 14, 16, 20]), 30);
    expect(s.baseline.mean).toBe(13);
    expect(s.z).not.toBeNull();
    expect(s.z!).toBeGreaterThan(1.5);
    expect(s.meaningful).toBe(true);
  });

  it("ignores trailing nulls when finding the latest value", () => {
    const s = summarizeMetric(series([10, 12, 14, null]), 30);
    expect(s.latest).toEqual({ day: "2024-01-03", value: 14 });
  });

  it("respects the window size", () => {
    // window 2 → baseline is only the two days before the latest: [8,8].
    const s = summarizeMetric(series([1, 1, 1, 8, 8, 12]), 2);
    expect(s.baseline).toMatchObject({ mean: 8, n: 2 });
  });
});
