import { describe, expect, it } from "vitest";

import {
  alphaFor,
  currentForm,
  fitnessForm,
  formStatus,
  type FormPoint,
} from "./fitness-form";
import type { DaySeries } from "./types";

/** Build a densified strain series from raw values starting at 2026-01-01. */
const series = (values: (number | null)[]): DaySeries =>
  values.map((value, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("alphaFor", () => {
  it("derives α = 1 − e^(−1/days)", () => {
    expect(alphaFor(7)).toBeCloseTo(1 - Math.exp(-1 / 7), 10);
    expect(alphaFor(42)).toBeCloseTo(1 - Math.exp(-1 / 42), 10);
  });

  it("stays in (0, 1)", () => {
    for (const d of [1, 7, 42, 365]) {
      const a = alphaFor(d);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    }
  });

  it("rejects non-positive time constants", () => {
    expect(() => alphaFor(0)).toThrow(RangeError);
    expect(() => alphaFor(-3)).toThrow(RangeError);
  });
});

describe("fitnessForm", () => {
  it("converges to zero form under constant load (steady state)", () => {
    const points = fitnessForm(series(Array(300).fill(10)));
    const last = points.at(-1)!;
    expect(last.fitness).toBeCloseTo(10, 1);
    expect(last.fatigue).toBeCloseTo(10, 1);
    expect(last.form).toBeCloseTo(0, 1);
    expect(formStatus(last)).toBe("neutral");
  });

  it("goes negative (fatigued) during a hard block", () => {
    // Long easy base, then a sustained hard block: fatigue outruns fitness.
    const points = fitnessForm(
      series([...Array(60).fill(8), ...Array(14).fill(18)]),
    );
    const last = points.at(-1)!;
    expect(last.fatigue!).toBeGreaterThan(last.fitness!);
    expect(last.form!).toBeLessThan(0);
    expect(formStatus(last)).toBe("fatigued");
  });

  it("goes positive (fresh) after a taper/rest", () => {
    // Hard block, then rest: fast fatigue collapses below slow fitness.
    const points = fitnessForm(
      series([...Array(40).fill(14), ...Array(14).fill(0)]),
    );
    const last = points.at(-1)!;
    expect(last.fitness!).toBeGreaterThan(last.fatigue!);
    expect(last.form!).toBeGreaterThan(0);
    expect(formStatus(last)).toBe("fresh");
  });

  it("fatigue reacts faster than fitness to a load spike", () => {
    const points = fitnessForm(series([...Array(30).fill(5), 20]));
    const last = points.at(-1)!;
    // One big day lifts the 7-day EWMA much more than the 42-day EWMA.
    expect(last.fatigue!).toBeGreaterThan(last.fitness!);
  });

  it("is null-gap aware: gaps yield null and bridge (don't reset) state", () => {
    // Asymmetric values around the gap distinguish bridging from resetting: a
    // reset would re-seed the post-gap day to its raw value (10 − 10 → form 0);
    // bridging blends from the pre-gap state, so the two EWMAs diverge and form
    // is non-zero.
    const points = fitnessForm(series([10, null, 5]));
    expect(points[1]).toMatchObject({ fitness: null, fatigue: null, form: null });
    const af = 1 - Math.exp(-1 / 42); // fitness α
    const at = 1 - Math.exp(-1 / 7); // fatigue α
    const expected = (af * 5 + (1 - af) * 10) - (at * 5 + (1 - at) * 10);
    expect(points[2].form).toBeCloseTo(expected, 10);
    expect(points[2].form).not.toBeCloseTo(0, 2); // would be 0 if state reset
  });

  it("returns an empty array for an empty series", () => {
    expect(fitnessForm([])).toEqual([]);
  });

  it("respects custom time constants", () => {
    const s = series([...Array(20).fill(6), 16]);
    const fast = fitnessForm(s, { fitnessDays: 10, fatigueDays: 2 });
    const slow = fitnessForm(s, { fitnessDays: 60, fatigueDays: 14 });
    // Shorter constants react harder to the final spike → larger |form|.
    expect(Math.abs(fast.at(-1)!.form!)).toBeGreaterThan(
      Math.abs(slow.at(-1)!.form!),
    );
  });
});

describe("formStatus", () => {
  const at = (fitness: number, form: number): FormPoint => ({
    day: "2026-01-01",
    fitness,
    fatigue: fitness - form,
    form,
  });

  it("uses a fitness-scaled deadband", () => {
    // fitness 10 → band ±1.0
    expect(formStatus(at(10, 0.5))).toBe("neutral");
    expect(formStatus(at(10, 1.5))).toBe("fresh");
    expect(formStatus(at(10, -1.5))).toBe("fatigued");
  });

  it("scales the band with fitness", () => {
    // fitness 20 → band ±2.0, so form 1.5 is now neutral
    expect(formStatus(at(20, 1.5))).toBe("neutral");
  });

  it("applies an absolute floor at low fitness", () => {
    // fitness 2 → scaled band 0.2, but the floor (0.5) wins: 0.3 stays neutral.
    expect(formStatus(at(2, 0.3))).toBe("neutral");
    // Above the floor it still classifies.
    expect(formStatus(at(2, 0.6))).toBe("fresh");
  });

  it("returns null when form is unavailable", () => {
    expect(
      formStatus({ day: "2026-01-01", fitness: null, fatigue: null, form: null }),
    ).toBeNull();
  });
});

describe("currentForm", () => {
  it("returns the latest point with a computable form", () => {
    const points = fitnessForm(series([10, 12, null]));
    expect(currentForm(points)?.day).toBe("2026-01-02");
  });

  it("returns null when nothing has form", () => {
    expect(currentForm(fitnessForm(series([null, null])))).toBeNull();
    expect(currentForm([])).toBeNull();
  });
});
