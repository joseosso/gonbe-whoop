import { describe, expect, it } from "vitest";

import { dayOfWeekEffect } from "./day-of-week";
import type { DaySeries } from "./types";

// 2024-01-01 is a Monday, so index 1 (Mon) … and the week repeats every 7 days.
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("dayOfWeekEffect", () => {
  it("computes per-weekday mean, n and delta from the overall mean", () => {
    // Mon=10,20 (mean 15); Tue=30 (mean 30). Overall mean = (10+20+30)/3 = 20.
    const out = dayOfWeekEffect(series([10, 30, null, null, null, null, null, 20]));

    const mon = out.byWeekday[1];
    const tue = out.byWeekday[2];
    expect(out.overall.mean).toBeCloseTo(20);
    expect(out.overall.n).toBe(3);
    expect(mon.weekday).toBe("Mon");
    expect(mon.n).toBe(2);
    expect(mon.mean).toBeCloseTo(15);
    expect(mon.delta).toBeCloseTo(-5);
    expect(tue.n).toBe(1);
    expect(tue.mean).toBeCloseTo(30);
    expect(tue.delta).toBeCloseTo(10);
  });

  it("returns all seven weekdays ordered Sun → Sat", () => {
    const out = dayOfWeekEffect(series([1]));
    expect(out.byWeekday.map((w) => w.weekday)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("skips null values; weekdays with no data report n=0 and null stats", () => {
    const out = dayOfWeekEffect(series([null, null, null]));
    expect(out.overall).toEqual({ mean: null, sd: null, n: 0 });
    for (const w of out.byWeekday) {
      expect(w.n).toBe(0);
      expect(w.mean).toBeNull();
      expect(w.delta).toBeNull();
    }
  });

  it("reports SD per weekday (null for a single observation)", () => {
    // Mon gets two values a week apart; Tue gets one.
    const out = dayOfWeekEffect(series([10, 5, null, null, null, null, null, 20]));
    const mon = out.byWeekday[1];
    const tue = out.byWeekday[2];
    expect(mon.n).toBe(2);
    expect(mon.sd).toBeCloseTo(Math.sqrt(((10 - 15) ** 2 + (20 - 15) ** 2) / 1));
    expect(tue.sd).toBeNull();
  });

  it("handles an empty series", () => {
    const out = dayOfWeekEffect([]);
    expect(out.overall.n).toBe(0);
    expect(out.byWeekday).toHaveLength(7);
  });
});
