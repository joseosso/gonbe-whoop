import { describe, expect, it } from "vitest";

import { tagDrivers } from "./driver-analysis";
import type { DaySeries } from "./types";

// 2024-01-01 … sequential days; value = next-day outcome we want to read.
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

const d = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;

describe("tagDrivers", () => {
  it("compares next-day outcome for tagged vs untagged days", () => {
    // Outcomes on days 1..6 = [_, 40, 90, 90, 90, 90]. Tag "sick" on day 1 and 2
    // → next-day outcomes are day2=40 and day3=90 (mean 65). Untagged days 3,4,5
    // → next-day outcomes day4,5,6 = 90 each (mean 90). Day 6 has no next day.
    const metric = series([0, 40, 90, 90, 90, 90]);
    const out = tagDrivers(metric, new Map([["sick", [d(1), d(2)]]]), {
      minN: 5,
    });
    expect(out).toHaveLength(1);
    const sick = out[0];
    expect(sick.taggedN).toBe(2);
    expect(sick.taggedMean).toBeCloseTo(65);
    expect(sick.untaggedN).toBe(3);
    expect(sick.untaggedMean).toBeCloseTo(90);
    expect(sick.delta).toBeCloseTo(-25);
    expect(sick.lowConfidence).toBe(true); // n=2 < minN
  });

  it("ignores tagged days with no scored next day (n=0)", () => {
    // Only day 1 has a next-day value; tag sits on day 5 (no next-day outcome).
    const metric = series([0, 50, null, null, null, null]);
    const out = tagDrivers(metric, new Map([["travel", [d(5)]]]));
    const travel = out[0];
    expect(travel.taggedN).toBe(0);
    expect(travel.taggedMean).toBeNull();
    expect(travel.delta).toBeNull();
    expect(travel.effectSize).toBeNull();
    expect(travel.lowConfidence).toBe(true);
  });

  it("computes Cohen's d when both groups have spread", () => {
    // Tagged next-days = [10, 20] (mean 15, sd √50); untagged = [30, 40] (mean
    // 35, sd √50). Pooled sd = √50; d = (15−35)/√50.
    const metric = series([0, 10, 20, 30, 40, null]);
    // days 1..4 evaluable (day5 has next-day=40, day5 itself value 40, next of
    // day5 is day6=null → day5 not evaluable). Tag days 1 & 2.
    const out = tagDrivers(metric, new Map([["stress", [d(1), d(2)]]]), {
      minN: 1,
    });
    const stress = out[0];
    expect(stress.taggedMean).toBeCloseTo(15);
    expect(stress.untaggedMean).toBeCloseTo(35);
    expect(stress.effectSize).toBeCloseTo(-20 / Math.sqrt(50));
    expect(stress.lowConfidence).toBe(false); // n=2 >= minN(1)
  });

  it("returns null effect size for a single tagged observation", () => {
    const metric = series([0, 10, 20, 30]);
    const out = tagDrivers(metric, new Map([["sick", [d(1)]]]), { minN: 1 });
    expect(out[0].taggedN).toBe(1);
    expect(out[0].effectSize).toBeNull(); // SD undefined at n=1
    expect(out[0].delta).toBeCloseTo(10 - 25); // 10 vs mean(20,30)
  });

  it("sorts drivers by tag and handles multiple tags", () => {
    const metric = series([0, 50, 60, 70]);
    const out = tagDrivers(
      metric,
      new Map([
        ["travel", [d(2)]],
        ["sick", [d(1)]],
      ]),
    );
    expect(out.map((o) => o.tag)).toEqual(["sick", "travel"]);
  });

  it("handles no tags", () => {
    expect(tagDrivers(series([1, 2, 3]), new Map())).toEqual([]);
  });
});
