import { describe, expect, it } from "vitest";

import {
  correlate,
  correlationPValue,
  lagPairs,
  pearson,
  rankDrivers,
  type DriverSpec,
} from "./correlate";
import type { DaySeries } from "./types";

const day = (i: number) =>
  new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({ day: day(i), value }));

describe("lagPairs", () => {
  it("pairs predictor day d with outcome day d + lag", () => {
    const x = series([1, 2, 3, 4]);
    const y = series([10, 20, 30, 40]);
    // lag 1: x[d] ↔ y[d+1] → (1,20),(2,30),(3,40); x[3] has no d+1.
    expect(lagPairs(x, y, 1)).toEqual([
      [1, 20],
      [2, 30],
      [3, 40],
    ]);
  });

  it("lag 0 aligns the same day and skips nulls on either side", () => {
    const x = series([1, null, 3, 4]);
    const y = series([10, 20, null, 40]);
    expect(lagPairs(x, y, 0)).toEqual([
      [1, 10],
      [4, 40],
    ]);
  });
});

describe("pearson", () => {
  it("is +1 for a perfectly increasing relationship", () => {
    expect(pearson([
      [1, 2],
      [2, 4],
      [3, 6],
    ]).r).toBeCloseTo(1);
  });

  it("is −1 for a perfectly decreasing relationship", () => {
    expect(pearson([
      [1, 6],
      [2, 4],
      [3, 2],
    ]).r).toBeCloseTo(-1);
  });

  it("is null when a side has no variance (undefined, not Infinity)", () => {
    expect(pearson([
      [1, 5],
      [2, 5],
      [3, 5],
    ]).r).toBeNull();
  });

  it("is null below two pairs", () => {
    expect(pearson([[1, 2]]).r).toBeNull();
  });
});

describe("correlationPValue", () => {
  it("is tiny for a strong correlation over many pairs", () => {
    const p = correlationPValue(0.9, 30);
    expect(p).not.toBeNull();
    expect(p!).toBeLessThan(0.001);
  });

  it("is large for a weak correlation", () => {
    expect(correlationPValue(0.05, 20)!).toBeGreaterThan(0.5);
  });

  it("is null when undefined (n < 4 or |r| = 1)", () => {
    expect(correlationPValue(0.5, 3)).toBeNull();
    expect(correlationPValue(1, 30)).toBeNull();
  });
});

describe("correlate", () => {
  // Strong (but imperfect) monotonic lag-1 link over enough days to be
  // significant — a perfect r = 1 has an undefined Fisher-z p-value.
  const x = series(Array.from({ length: 20 }, (_, i) => i));
  const y = series(Array.from({ length: 20 }, (_, i) => 2 * i + (i % 3)));

  it("flags a strong, well-sampled relationship as confident", () => {
    const c = correlate(x, y, 1, { minN: 8 });
    expect(c.r as number).toBeGreaterThan(0.97);
    expect(c.r as number).toBeLessThan(1);
    expect(c.n).toBe(19); // 20 days, lag 1 → 19 pairs
    expect(c.lowConfidence).toBe(false);
  });

  it("flags a thin sample as low-confidence regardless of r", () => {
    const sx = series([1, 2, 3, 4]);
    const sy = series([2, 4, 6, 8]);
    const c = correlate(sx, sy, 0, { minN: 8 });
    expect(c.r).toBeCloseTo(1);
    expect(c.lowConfidence).toBe(true); // n = 4 < 8
  });

  it("detects a lead relationship at the lag that aligns it (not at lag 0)", () => {
    // A non-periodic predictor; the outcome each day is twice the *previous*
    // day's predictor → the signal lives at lag 1 (predictor precedes outcome),
    // not same-day.
    const p = (i: number) => (i * 7) % 11;
    const pred = series(Array.from({ length: 20 }, (_, i) => p(i)));
    const out = series(
      Array.from({ length: 20 }, (_, i) => (i === 0 ? 0 : 2 * p(i - 1))),
    );
    expect(Math.abs(correlate(pred, out, 1).r as number)).toBeCloseTo(1);
    expect(Math.abs(correlate(pred, out, 0).r as number)).toBeLessThan(0.5);
  });

  it("flags a non-significant relationship as low-confidence", () => {
    // Alternating noise → near-zero correlation despite ample n.
    const noisy = series(Array.from({ length: 30 }, (_, i) => (i % 2 ? 1 : 0)));
    const flatish = series(Array.from({ length: 30 }, (_, i) => i % 3));
    const c = correlate(noisy, flatish, 0, { minN: 8 });
    expect(c.lowConfidence).toBe(true);
  });
});

describe("rankDrivers", () => {
  const outcome = series(Array.from({ length: 20 }, (_, i) => i));
  const specs: DriverSpec[] = [
    {
      key: "weak",
      label: "Weak",
      lag: 0,
      series: series(Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : 0))),
    },
    {
      key: "strong",
      label: "Strong",
      lag: 0,
      series: series(Array.from({ length: 20 }, (_, i) => -i)), // r = −1
    },
    {
      key: "flat",
      label: "Flat",
      lag: 0,
      series: series(Array(20).fill(5)), // no variance → dropped
    },
  ];

  it("ranks by absolute effect size and drops undefined correlations", () => {
    const ranked = rankDrivers(outcome, specs, { minN: 8 });
    expect(ranked.map((d) => d.key)).toEqual(["strong", "weak"]);
    expect(ranked[0].r).toBeCloseTo(-1);
    expect(ranked.find((d) => d.key === "flat")).toBeUndefined();
  });
});
