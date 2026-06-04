import { describe, expect, it } from "vitest";

import { ewma } from "./ewma";
import type { DaySeries } from "./types";

const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

const values = (s: DaySeries) => s.map((p) => p.value);

describe("ewma", () => {
  it("seeds on the first value and smooths the rest", () => {
    // α=0.5: 2, 0.5·4+0.5·2=3, 0.5·6+0.5·3=4.5
    expect(values(ewma(series([2, 4, 6]), 0.5))).toEqual([2, 3, 4.5]);
  });

  it("breaks the line at gaps but carries state across them", () => {
    // null is null; state stays 2, so resume blends 0.5·4+0.5·2 = 3
    expect(values(ewma(series([2, null, 4]), 0.5))).toEqual([2, null, 3]);
  });

  it("emits null until the first real value seeds the state", () => {
    expect(values(ewma(series([null, null, 4]), 0.5))).toEqual([
      null,
      null,
      4,
    ]);
  });

  it("preserves a constant series", () => {
    expect(values(ewma(series([5, 5, 5]), 0.2))).toEqual([5, 5, 5]);
  });

  it("passes values through unchanged at the α=1 upper bound", () => {
    expect(values(ewma(series([2, 4, 6]), 1))).toEqual([2, 4, 6]);
  });

  it("rejects an alpha outside (0, 1]", () => {
    expect(() => ewma(series([1]), 0)).toThrow(RangeError);
    expect(() => ewma(series([1]), 1.2)).toThrow(RangeError);
  });
});
