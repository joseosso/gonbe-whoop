import { describe, expect, it } from "vitest";

import {
  comparePeriods,
  monthlyMeans,
  monthOf,
  shiftMonth,
} from "./periods";
import type { DaySeries } from "./types";

const day = (month: string, d: number, value: number | null) => ({
  day: `${month}-${String(d).padStart(2, "0")}`,
  value,
});

describe("monthOf", () => {
  it("extracts the calendar month from a local day", () => {
    expect(monthOf("2024-03-15")).toBe("2024-03");
  });
});

describe("shiftMonth", () => {
  it("steps months and rolls the year boundary", () => {
    expect(shiftMonth("2024-03", -1)).toBe("2024-02");
    expect(shiftMonth("2024-01", -1)).toBe("2023-12");
    expect(shiftMonth("2024-03", -12)).toBe("2023-03");
    expect(shiftMonth("2024-01", -13)).toBe("2022-12");
    expect(shiftMonth("2024-11", 2)).toBe("2025-01");
  });
});

describe("monthlyMeans", () => {
  it("averages per calendar month, skipping nulls, ascending", () => {
    const series: DaySeries = [
      day("2024-02", 10, 8),
      day("2024-01", 1, 10),
      day("2024-01", 2, 20),
      day("2024-01", 3, null),
    ];
    const out = monthlyMeans(series);
    expect(out.map((m) => m.month)).toEqual(["2024-01", "2024-02"]);
    expect(out[0].mean).toBeCloseTo(15);
    expect(out[0].n).toBe(2);
    expect(out[1].mean).toBeCloseTo(8);
  });

  it("omits months with no scored days", () => {
    expect(monthlyMeans([day("2024-01", 1, null)])).toEqual([]);
  });
});

describe("comparePeriods", () => {
  it("computes MoM against the prior month and YoY against last year", () => {
    const series: DaySeries = [
      day("2023-03", 1, 50), // same month last year
      day("2024-02", 1, 70), // prior month
      day("2024-03", 1, 80),
    ];
    const out = comparePeriods(series);
    const mar24 = out.find((m) => m.month === "2024-03")!;
    expect(mar24.momDelta).toBeCloseTo(10); // 80 − 70
    expect(mar24.yoyDelta).toBeCloseTo(30); // 80 − 50
    expect(mar24.prevMonth?.month).toBe("2024-02");
    expect(mar24.prevYear?.month).toBe("2023-03");
  });

  it("yields null deltas when the comparison month is absent (gaps)", () => {
    const out = comparePeriods([day("2024-01", 1, 10), day("2024-03", 1, 30)]);
    const mar = out.find((m) => m.month === "2024-03")!;
    // Feb is missing, so MoM has no adjacent month to compare against.
    expect(mar.momDelta).toBeNull();
    expect(mar.prevMonth).toBeNull();
    expect(mar.yoyDelta).toBeNull();
  });

  it("handles an empty series", () => {
    expect(comparePeriods([])).toEqual([]);
  });
});
