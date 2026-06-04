import { describe, expect, it } from "vitest";

import {
  backtestForecast,
  buildForecast,
  currentForecast,
  recoveryBand,
  scoreFromDrivers,
  type DriverZ,
  type ForecastInputs,
  type ForecastPoint,
} from "./forecast";
import type { DaySeries } from "./types";

const day = (i: number) =>
  new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({ day: day(i), value }));

const noDrivers: DriverZ = {
  strain: null,
  debt: null,
  acwr: null,
  hrvSlope: null,
};
const rec = { mean: 50, sd: 20 };

describe("recoveryBand", () => {
  it("maps the WHOOP band boundaries", () => {
    expect(recoveryBand(0)).toBe("red");
    expect(recoveryBand(33)).toBe("red");
    expect(recoveryBand(34)).toBe("amber");
    expect(recoveryBand(66)).toBe("amber");
    expect(recoveryBand(67)).toBe("green");
    expect(recoveryBand(100)).toBe("green");
  });
});

describe("scoreFromDrivers", () => {
  it("predicts the baseline mean when every driver sits on its baseline", () => {
    const f = scoreFromDrivers({ ...noDrivers, strain: 0, debt: 0 }, rec);
    expect(f.pressure).toBe(0);
    expect(f.score).toBe(50);
    expect(f.band).toBe("amber");
  });

  it("an adverse driver (high strain) lowers the predicted score", () => {
    const f = scoreFromDrivers({ ...noDrivers, strain: 1 }, rec);
    // Only strain present → pressure = +1 → predZ = −1 → 50 − 20.
    expect(f.pressure).toBe(1);
    expect(f.score).toBe(30);
    expect(f.band).toBe("red");
    expect(f.drivers).toHaveLength(1);
    expect(f.drivers[0]).toMatchObject({ key: "strain", effect: -1 });
  });

  it("a favourable driver (rising HRV) raises the predicted score", () => {
    const f = scoreFromDrivers({ ...noDrivers, hrvSlope: 1 }, rec);
    expect(f.pressure).toBe(-1);
    expect(f.score).toBe(70);
    expect(f.band).toBe("green");
    expect(f.drivers[0]).toMatchObject({ key: "hrvSlope", effect: 1 });
  });

  it("ranks drivers by the magnitude of their effect", () => {
    const f = scoreFromDrivers({ ...noDrivers, strain: 1, acwr: 3 }, rec);
    expect(f.drivers.map((d) => d.key)).toEqual(["acwr", "strain"]);
  });

  it("returns a null score (but keeps drivers) on an undefined recovery baseline", () => {
    const f = scoreFromDrivers({ ...noDrivers, strain: 1 }, { mean: null, sd: null });
    expect(f.score).toBeNull();
    expect(f.band).toBeNull();
    expect(f.pressure).toBe(1);
    expect(f.drivers).toHaveLength(1);
  });

  it("returns all-null when no driver has a reading", () => {
    expect(scoreFromDrivers(noDrivers, rec)).toEqual({
      score: null,
      band: null,
      pressure: null,
      drivers: [],
    });
  });
});

describe("buildForecast", () => {
  // 40 days: recovery & drivers carry spread so baselines are defined; the last
  // day spikes strain hard, so tomorrow's forecast should read low.
  const n = 40;
  const osc = (a: number, b: number) =>
    Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a : b));
  const inputs: ForecastInputs = {
    recovery: series(osc(60, 40)),
    strain: series(osc(8, 12).map((v, i) => (i === n - 1 ? 20 : v))),
    debt: series(osc(-1, 1)),
    acwr: series(osc(0.9, 1.1)),
    hrv: series(osc(80, 90)),
  };

  it("anchors each point on d and forecasts d+1", () => {
    const points = buildForecast(inputs);
    expect(points).toHaveLength(n);
    expect(points[0].day).toBe("2024-01-01");
    expect(points[0].forDay).toBe("2024-01-02");
    expect(points.at(-1)!.day).toBe("2024-02-09");
    expect(points.at(-1)!.forDay).toBe("2024-02-10");
  });

  it("a fresh strain spike drives tomorrow's forecast down", () => {
    const current = currentForecast(buildForecast(inputs))!;
    expect(current.score).not.toBeNull();
    expect(current.score!).toBeGreaterThanOrEqual(0);
    expect(current.score!).toBeLessThan(50); // below the ~50 mean
    expect(current.drivers[0].key).toBe("strain"); // the dominant driver
  });

  it("degrades to a null forecast on calm/flat history (no spread)", () => {
    const flat = series(Array(n).fill(10));
    const current = currentForecast(
      buildForecast({
        recovery: flat,
        strain: flat,
        debt: flat,
        acwr: flat,
        hrv: flat,
      }),
    )!;
    expect(current.score).toBeNull();
    expect(current.band).toBeNull();
  });
});

describe("backtestForecast", () => {
  const point = (
    d: number,
    score: number | null,
    band: ForecastPoint["band"],
  ): ForecastPoint => ({
    day: day(d),
    forDay: day(d + 1),
    score,
    band,
    pressure: 0,
    drivers: [],
  });

  it("scores MAE, band-hit-rate, and within-one-band over matched days", () => {
    const points = [
      point(0, 70, "green"), // forDay d2: actual 68 green → hit, err 2
      point(1, 70, "green"), // forDay d3: actual 20 red   → miss, 2 bands off
      point(2, 40, "amber"), // forDay d4: actual 50 amber → hit, err 10
      point(3, null, null), // skipped (no score)
      point(4, 30, "red"), // forDay d6: no actual → skipped
    ];
    const actual = series([null, 68, 20, 50, null, null]);
    const r = backtestForecast(points, actual);
    expect(r.n).toBe(3);
    expect(r.mae).toBeCloseTo((2 + 50 + 10) / 3);
    expect(r.bandHitRate).toBeCloseTo(2 / 3);
    expect(r.withinOneBand).toBeCloseTo(2 / 3);
  });

  it("returns nulls when nothing matches", () => {
    expect(backtestForecast([], series([50, 50]))).toEqual({
      n: 0,
      mae: null,
      bandHitRate: null,
      withinOneBand: null,
    });
  });
});
