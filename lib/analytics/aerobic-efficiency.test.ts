import { describe, expect, it } from "vitest";

import {
  aerobicEfficiency,
  type EfficiencyWorkout,
} from "./aerobic-efficiency";
import type { DaySeries } from "./types";

/** Steady aerobic zone profile (Z1–3 only), so workouts are comparable by default. */
const STEADY: EfficiencyWorkout["zoneMilli"] = [0, 600_000, 600_000, 600_000, 0, 0];

const w = (
  over: Partial<EfficiencyWorkout> & { day: string },
): EfficiencyWorkout => ({
  sportName: "Run",
  avgHr: 140,
  kilojoule: 1400,
  strain: 10,
  zoneMilli: STEADY,
  ...over,
});

const noConfirm = { restingHr: [] as DaySeries, hrv: [] as DaySeries };

describe("aerobicEfficiency", () => {
  it("computes monthly output-per-HR and its EWMA", () => {
    const out = aerobicEfficiency(
      [
        w({ day: "2024-01-05", kilojoule: 1400, avgHr: 140 }), // 10
        w({ day: "2024-01-20", kilojoule: 1500, avgHr: 150 }), // 10
        w({ day: "2024-02-10", kilojoule: 1320, avgHr: 120 }), // 11
      ],
      noConfirm,
    );
    expect(out.sport).toBe("Run");
    expect(out.metric).toBe("kilojoule");
    expect(out.months.map((m) => m.month)).toEqual(["2024-01", "2024-02"]);
    expect(out.months[0].index).toBeCloseTo(10);
    expect(out.months[0].n).toBe(2);
    expect(out.months[1].index).toBeCloseTo(11);
    // EWMA: seed 10, then 0.3·11 + 0.7·10 = 10.3.
    expect(out.months[0].smoothed).toBeCloseTo(10);
    expect(out.months[1].smoothed).toBeCloseTo(10.3);
  });

  it("excludes non-comparable workouts (no HR/output, spiky profile)", () => {
    const out = aerobicEfficiency(
      [
        w({ day: "2024-01-01" }), // comparable
        w({ day: "2024-01-02", avgHr: null }), // no HR
        w({ day: "2024-01-03", kilojoule: 0 }), // no output
        w({ day: "2024-01-04", zoneMilli: [0, 0, 0, 0, 0, 900_000] }), // all Z5 → spiky
      ],
      noConfirm,
    );
    expect(out.n).toBe(1);
  });

  it("keeps workouts with no zone data (steadiness unknown)", () => {
    const out = aerobicEfficiency(
      [w({ day: "2024-01-01", zoneMilli: [null, null, null, null, null, null] })],
      noConfirm,
    );
    expect(out.n).toBe(1);
  });

  it("auto-picks the dominant comparable sport", () => {
    const out = aerobicEfficiency(
      [
        w({ day: "2024-01-01", sportName: "Run" }),
        w({ day: "2024-01-02", sportName: "Run" }),
        w({ day: "2024-01-03", sportName: "Cycling" }),
      ],
      noConfirm,
    );
    expect(out.sport).toBe("Run");
    expect(out.n).toBe(2);
  });

  it("honors an explicit sport filter", () => {
    const out = aerobicEfficiency(
      [
        w({ day: "2024-01-01", sportName: "Run" }),
        w({ day: "2024-01-02", sportName: "Cycling" }),
      ],
      noConfirm,
      { sport: "Cycling" },
    );
    expect(out.sport).toBe("Cycling");
    expect(out.n).toBe(1);
  });

  it("flags months below minN as low-confidence", () => {
    const out = aerobicEfficiency(
      [
        w({ day: "2024-01-05" }),
        w({ day: "2024-01-20" }),
        w({ day: "2024-02-10" }),
      ],
      noConfirm,
      { minN: 2 },
    );
    expect(out.months[0].lowConfidence).toBe(false); // n=2
    expect(out.months[1].lowConfidence).toBe(true); // n=1 < 2
  });

  it("fills gap months with a null index on a contiguous axis", () => {
    const out = aerobicEfficiency(
      [w({ day: "2024-01-15" }), w({ day: "2024-03-15" })],
      noConfirm,
    );
    expect(out.months.map((m) => m.month)).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
    ]);
    expect(out.months[1].index).toBeNull();
    expect(out.months[1].n).toBe(0);
  });

  it("supports strain as the output metric", () => {
    const out = aerobicEfficiency(
      [w({ day: "2024-01-01", strain: 14, avgHr: 140 })],
      noConfirm,
      { metric: "strain" },
    );
    expect(out.metric).toBe("strain");
    expect(out.months[0].index).toBeCloseTo(0.1); // 14 / 140
  });

  it("summarizes confirming RHR (falling) and HRV (rising) signals", () => {
    const rhr: DaySeries = [
      { day: "2024-01-10", value: 60 },
      { day: "2024-02-10", value: 55 },
    ];
    const hrv: DaySeries = [
      { day: "2024-01-10", value: 40 },
      { day: "2024-02-10", value: 45 },
    ];
    const out = aerobicEfficiency([w({ day: "2024-01-01" })], { restingHr: rhr, hrv });
    expect(out.confirm.restingHr.delta).toBeCloseTo(-5);
    expect(out.confirm.restingHr.improving).toBe(true); // RHR down = better
    expect(out.confirm.hrv.delta).toBeCloseTo(5);
    expect(out.confirm.hrv.improving).toBe(true); // HRV up = better
  });

  it("is empty with no comparable workouts", () => {
    const out = aerobicEfficiency([w({ day: "2024-01-01", avgHr: 0 })], noConfirm);
    expect(out.empty).toBe(true);
    expect(out.sport).toBeNull();
    expect(out.months).toEqual([]);
  });
});
