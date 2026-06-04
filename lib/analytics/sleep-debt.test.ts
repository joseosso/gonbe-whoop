import { describe, expect, it } from "vitest";

import { sleepDebt, type SleepNight } from "./sleep-debt";

// Unit-agnostic: use minutes as the "milli" unit for readable numbers.
const nights = (
  rows: ([number, number] | null)[],
): SleepNight[] =>
  rows.map((row, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    needMilli: row?.[0] ?? null,
    actualMilli: row?.[1] ?? null,
  }));

describe("sleepDebt", () => {
  it("accumulates need − actual over the trailing window", () => {
    const out = sleepDebt(
      nights([
        [480, 420], // -60 deficit
        [480, 360], // -120 deficit
        [480, 480], // 0
      ]),
      14,
    );
    expect(out.map((p) => p.debtMilli)).toEqual([60, 180, 180]);
    expect(out.map((p) => p.nights)).toEqual([1, 2, 3]);
  });

  it("treats banked sleep as negative debt", () => {
    const out = sleepDebt(nights([[420, 480]]), 14);
    expect(out[0].debtMilli).toBe(-60);
  });

  it("skips nights missing need or actual", () => {
    const out = sleepDebt(nights([[480, 420], null, [480, 400]]), 14);
    expect(out.map((p) => p.nights)).toEqual([1, 1, 2]);
    expect(out[2].debtMilli).toBe(60 + 80);
  });

  it("returns null debt when the window holds no scored nights", () => {
    const out = sleepDebt(nights([null, null]), 14);
    expect(out).toEqual([
      { day: "2024-01-01", debtMilli: null, nights: 0 },
      { day: "2024-01-02", debtMilli: null, nights: 0 },
    ]);
  });

  it("respects the window size", () => {
    const out = sleepDebt(nights([[480, 420], [480, 420], [480, 420]]), 1);
    expect(out.map((p) => p.debtMilli)).toEqual([60, 60, 60]); // only self
  });

  it("rejects a window < 1", () => {
    expect(() => sleepDebt(nights([[1, 1]]), 0)).toThrow(RangeError);
  });
});
