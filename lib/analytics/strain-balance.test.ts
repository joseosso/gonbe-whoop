import { describe, expect, it } from "vitest";

import { flagStrainRecovery } from "./strain-balance";

const row = (day: string, strain: number, recovery: number) => ({
  day,
  strain,
  recovery,
});

describe("flagStrainRecovery", () => {
  it("flags only high-strain on low-recovery days", () => {
    const out = flagStrainRecovery([
      row("a", 16, 30), // high strain, low recovery → flagged
      row("b", 16, 80), // high strain, good recovery → ok
      row("c", 8, 30), // low strain, low recovery → ok
      row("d", 5, 90), // easy day → ok
    ]);
    expect(out.map((p) => p.flagged)).toEqual([true, false, false, false]);
  });

  it("treats the thresholds as inclusive boundaries", () => {
    const out = flagStrainRecovery([row("x", 14, 34)]);
    expect(out[0].flagged).toBe(true);
  });

  it("respects custom thresholds", () => {
    const out = flagStrainRecovery([row("x", 12, 50)], {
      highStrain: 10,
      lowRecovery: 60,
    });
    expect(out[0].flagged).toBe(true);
  });
});
