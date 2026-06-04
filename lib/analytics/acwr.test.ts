import { describe, expect, it } from "vitest";

import {
  acwrSeries,
  acwrStatus,
  currentAcwr,
  priorLoads,
  projectAcwr,
  strainBudget,
  type PriorLoads,
} from "./acwr";
import type { DaySeries } from "./types";

const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("acwrStatus", () => {
  it("classifies the band boundaries per SPEC §5", () => {
    expect(acwrStatus(0.79)).toBe("low");
    expect(acwrStatus(0.8)).toBe("optimal"); // sweet spot starts at 0.8
    expect(acwrStatus(1.0)).toBe("optimal");
    expect(acwrStatus(1.3)).toBe("optimal"); // inclusive top of sweet spot
    expect(acwrStatus(1.31)).toBe("high");
    expect(acwrStatus(1.5)).toBe("high"); // inclusive top of caution
    expect(acwrStatus(1.51)).toBe("elevated");
  });
});

describe("acwrSeries", () => {
  it("yields ratio 1 (optimal) for steady-state load", () => {
    const out = acwrSeries(series(Array(30).fill(10)));
    const last = out.at(-1)!;
    expect(last.acute).toBeCloseTo(10);
    expect(last.chronic).toBeCloseTo(10);
    expect(last.ratio).toBeCloseTo(1);
    expect(last.status).toBe("optimal");
    expect(last.chronicN).toBe(28);
  });

  it("flags a spike as elevated", () => {
    // 28 days of light load (5) then a heavy week (20): acute≈20, chronic≈8.75.
    const out = acwrSeries(series([...Array(28).fill(5), ...Array(7).fill(20)]));
    const last = out.at(-1)!;
    expect(last.acute).toBeCloseTo(20);
    expect(last.ratio!).toBeGreaterThan(1.5);
    expect(last.status).toBe("elevated");
  });

  it("skips null days within each window", () => {
    const out = acwrSeries(series([10, null, 10, null, 10, 10, 10, 10]));
    const last = out.at(-1)!;
    expect(last.acute).toBeCloseTo(10); // nulls ignored, mean of present 10s
    expect(last.ratio).toBeCloseTo(1);
  });

  it("returns null ratio when chronic load is zero", () => {
    const out = acwrSeries(series([0, 0, 0]));
    expect(out.at(-1)!.ratio).toBeNull();
    expect(out.at(-1)!.status).toBeNull();
  });
});

describe("currentAcwr", () => {
  it("returns the most recent point with a ratio", () => {
    const out = acwrSeries(series([10, 10, 10, null]));
    // Last day is null but trailing windows still have data → ratio defined.
    expect(currentAcwr(out)?.ratio).toBeCloseTo(1);
  });

  it("returns null when no point has a ratio", () => {
    expect(currentAcwr(acwrSeries(series([null, null])))).toBeNull();
  });
});

describe("priorLoads", () => {
  it("sums the days before today, excluding today, per window", () => {
    // 30 steady days of 10; today is the 30th. Acute lookback = 6 prior days,
    // chronic lookback = 27 prior days.
    const p = priorLoads(series(Array(30).fill(10)));
    expect(p).toEqual({
      acuteSum: 60,
      acuteN: 6,
      chronicSum: 270,
      chronicN: 27,
    });
  });

  it("skips null days within the lookback", () => {
    const p = priorLoads(series([10, null, 10, 10]), {
      acuteWindow: 3,
      chronicWindow: 4,
    });
    // before today = [10, null, 10]; acute lookback (2) = [null, 10].
    expect(p.acuteSum).toBe(10);
    expect(p.acuteN).toBe(1);
  });
});

describe("projectAcwr", () => {
  const steady = priorLoads(series(Array(30).fill(10)));

  it("returns 1.0 when today matches the steady load", () => {
    expect(projectAcwr(10, steady)).toBeCloseTo(1);
  });

  it("drops below 1 for a rest day and rises with a hard day", () => {
    expect(projectAcwr(0, steady)!).toBeLessThan(1);
    expect(projectAcwr(20, steady)!).toBeGreaterThan(1);
  });

  it("returns null when there is no chronic load", () => {
    expect(projectAcwr(0, { acuteSum: 0, acuteN: 0, chronicSum: 0, chronicN: 0 })).toBeNull();
  });
});

describe("strainBudget", () => {
  it("solves for the max strain that lands exactly on the target", () => {
    const steady = priorLoads(series(Array(30).fill(10)));
    const budget = strainBudget(steady, 1.3);
    expect(budget).toBeCloseTo(111 / 2.7); // (1.3·270 − 4·60)/(4 − 1.3)
    // Feeding the budget back through projectAcwr lands on the target.
    expect(projectAcwr(budget!, steady)).toBeCloseTo(1.3);
  });

  it("clamps to 0 when prior load already exceeds the target", () => {
    const hot: PriorLoads = {
      acuteSum: 120,
      acuteN: 6,
      chronicSum: 120,
      chronicN: 27,
    };
    expect(strainBudget(hot, 1.3)).toBe(0);
  });

  it("returns null when history is too thin to bound a day", () => {
    // Two days only: k = (1+1)/(1+1) = 1 ≤ target, can't bound.
    expect(strainBudget(priorLoads(series([10, 10])), 1.3)).toBeNull();
  });
});
