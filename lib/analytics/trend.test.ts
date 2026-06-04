import { describe, expect, it } from "vitest";

import { buildTrend } from "./trend";
import type { DaySeries } from "./types";

const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("buildTrend", () => {
  const range = { from: "2024-01-01", to: "2024-01-03" };

  it("emits raw, EWMA and an inclusive baseline band per day", () => {
    const out = buildTrend(series([10, 12, 14]), range, { alpha: 0.2 });

    expect(out.map((p) => p.raw)).toEqual([10, 12, 14]);
    // EWMA: 10, .2*12+.8*10=10.4, .2*14+.8*10.4=11.12
    expect(out[1].ewma).toBeCloseTo(10.4, 10);
    expect(out[2].ewma).toBeCloseTo(11.12, 10);
    // Band at day 1 (n=1) collapses to [mean, mean]; day 3 = [10, 14].
    expect(out[0].band).toEqual([10, 10]);
    expect(out[2].band).toEqual([10, 14]);
  });

  it("fills missing days as null gaps with no band", () => {
    const out = buildTrend(
      [{ day: "2024-01-01", value: 5 }],
      { from: "2024-01-01", to: "2024-01-03" },
    );
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ raw: null, ewma: null });
    // Day 2/3 still carry day-1's value in their trailing window.
    expect(out[2].band).toEqual([5, 5]);
  });
});
