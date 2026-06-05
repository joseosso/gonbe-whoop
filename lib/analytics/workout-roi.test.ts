import { describe, expect, it } from "vitest";

import type { DaySeries } from "./types";
import { type RoiWorkout, workoutRoi } from "./workout-roi";

const d = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;

/** Densified daily recovery from 2024-01-01 onward. */
const recovery = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({ day: d(i + 1), value }));

const wk = (
  day: number,
  sportName: string | null,
  strain: number | null,
  kilojoule: number | null = null,
): RoiWorkout => ({ day: d(day), sportName, strain, kilojoule });

describe("workoutRoi", () => {
  it("joins next-day recovery vs baseline, grouping by sport (window=1)", () => {
    // window=1 → baseline at day D is that day's own recovery. Deltas:
    //   strength d1: next(d2)=48 − base(d1)=60 = −12, /10 = −1.2
    //   strength d3: next(d4)=60 − base(d3)=60 =   0, /12 =  0
    //   run      d5: next(d6)=60 − base(d5)=51 =  +9, / 9 = +1.0
    const rec = recovery([60, 48, 60, 60, 51, 60]);
    const out = workoutRoi(
      [wk(1, "Strength", 10), wk(3, "Strength", 12), wk(5, "Run", 9)],
      rec,
      { window: 1 },
    );

    // Costliest-per-strain first: Strength (−0.6) before Run (+1.0).
    expect(out.map((r) => r.sport)).toEqual(["Strength", "Run"]);
    const [strength, run] = out;
    expect(strength.n).toBe(2);
    expect(strength.recoveryDelta.mean).toBeCloseTo(-6);
    expect(strength.perStrain.mean).toBeCloseTo(-0.6);
    expect(run.n).toBe(1);
    expect(run.recoveryDelta.mean).toBeCloseTo(9);
    expect(run.perStrain.mean).toBeCloseTo(1);
    expect(strength.lowConfidence).toBe(true); // n=2 < default minN(5)
  });

  it("uses the trailing-window baseline, not the workout day alone", () => {
    // window=2 → baseline at d2 = mean(d1, d2) = mean(40, 60) = 50.
    // delta = next(d3)=30 − 50 = −20; /10 = −2.
    const out = workoutRoi([wk(2, "Run", 10)], recovery([40, 60, 30]), {
      window: 2,
    });
    expect(out[0].recoveryDelta.mean).toBeCloseTo(-20);
    expect(out[0].perStrain.mean).toBeCloseTo(-2);
  });

  it("skips sessions with no scored next-day recovery or null strain (NaN-safe)", () => {
    // d1's next day (d2) has no recovery; d2's workout has null strain.
    const out = workoutRoi(
      [wk(1, "Run", 10), wk(2, "Run", null)],
      recovery([50, null, 50]),
      { window: 1 },
    );
    expect(out).toEqual([]);
  });

  it("counts a zero-strain session but leaves its per-strain ratio empty", () => {
    const out = workoutRoi([wk(1, "Yoga", 0)], recovery([50, 40]), {
      window: 1,
    });
    expect(out[0].n).toBe(1);
    expect(out[0].recoveryDelta.mean).toBeCloseTo(-10);
    expect(out[0].perStrain.mean).toBeNull(); // strain 0 → ratio undefined
    expect(out[0].perStrain.n).toBe(0);
  });

  it("computes recovery delta per 1,000 kJ and skips workouts missing energy", () => {
    // d1: delta −6, strain 6, kJ 2000 → −6 / (2000/1000) = −3 per 1k kJ.
    // d3: delta −6, strain 6, no kJ → excluded from the per-kJ stat only.
    const out = workoutRoi(
      [wk(1, "Run", 6, 2000), wk(3, "Run", 6)],
      recovery([50, 44, 50, 44]),
      { window: 1 },
    );
    expect(out[0].n).toBe(2);
    expect(out[0].perKilojoule.mean).toBeCloseTo(-3);
    expect(out[0].perKilojoule.n).toBe(1);
  });

  it("respects the minN low-confidence threshold", () => {
    const rec = recovery([50, 40, 50]);
    const confident = workoutRoi([wk(1, "Run", 10)], rec, {
      window: 1,
      minN: 1,
    });
    expect(confident[0].lowConfidence).toBe(false); // n=1 >= minN(1)
    const thin = workoutRoi([wk(1, "Run", 10)], rec, { window: 1, minN: 2 });
    expect(thin[0].lowConfidence).toBe(true); // n=1 < minN(2)
  });

  it("labels unnamed sports and sorts per-strain-less groups last", () => {
    // Unknown group has only a zero-strain session → no perStrain → sorts last.
    const out = workoutRoi(
      [wk(1, null, 0), wk(3, "Run", 10)],
      recovery([50, 45, 50, 60]),
      { window: 1 },
    );
    expect(out.map((r) => r.sport)).toEqual(["Run", "Unknown"]);
  });

  it("returns nothing for no workouts", () => {
    expect(workoutRoi([], recovery([50, 60, 70]))).toEqual([]);
  });
});
