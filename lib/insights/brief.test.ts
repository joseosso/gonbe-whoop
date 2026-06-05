import { describe, expect, it } from "vitest";

import { buildBrief, type BriefInput, type Verdict } from "./brief";

/** A fully-null brief input; override per case. */
const base: BriefInput = {
  day: "2026-06-04",
  recovery: { score: null, band: null },
  forecast: { score: null, band: null },
  acwr: { ratio: null, status: null },
  strainCeiling: null,
  sleepDebtHours: { now: null, trend: null },
  earlyWarning: null,
};

const make = (over: Partial<BriefInput>): BriefInput => ({ ...base, ...over });
const ids = (input: BriefInput) => buildBrief(input).reasons.map((r) => r.id);
const reason = (input: BriefInput, id: string) =>
  buildBrief(input).reasons.find((r) => r.id === id);

describe("buildBrief — verdict from the worst guardrail", () => {
  const cases: { name: string; input: BriefInput; verdict: Verdict }[] = [
    {
      name: "green recovery, optimal load, low debt → hard",
      input: make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.0, status: "optimal" },
        strainCeiling: 14,
        sleepDebtHours: { now: 2, trend: 0 },
      }),
      verdict: "hard",
    },
    {
      name: "amber recovery caps to moderate",
      input: make({
        recovery: { score: 50, band: "amber" },
        acwr: { ratio: 1.0, status: "optimal" },
      }),
      verdict: "moderate",
    },
    {
      name: "red recovery caps to easy",
      input: make({
        recovery: { score: 20, band: "red" },
        acwr: { ratio: 1.0, status: "optimal" },
      }),
      verdict: "easy",
    },
    {
      name: "elevated ACWR caps to easy even on green recovery",
      input: make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.7, status: "elevated" },
      }),
      verdict: "easy",
    },
    {
      name: "high ACWR caps to moderate",
      input: make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.4, status: "high" },
      }),
      verdict: "moderate",
    },
    {
      name: "high sleep debt caps to moderate",
      input: make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.0, status: "optimal" },
        sleepDebtHours: { now: 7, trend: 1 },
      }),
      verdict: "moderate",
    },
    {
      name: "illness watch caps to easy",
      input: make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.0, status: "optimal" },
        earlyWarning: {
          status: "watch",
          breachCount: 2,
          drivers: [{ label: "HRV", z: -1.8 }],
        },
      }),
      verdict: "easy",
    },
    {
      name: "illness alert overrides everything → rest",
      input: make({
        recovery: { score: 90, band: "green" },
        acwr: { ratio: 1.0, status: "optimal" },
        earlyWarning: {
          status: "alert",
          breachCount: 3,
          drivers: [{ label: "Skin temp", z: 2.2 }],
        },
      }),
      verdict: "rest",
    },
    {
      name: "no usable signals → moderate (conservative default)",
      input: base,
      verdict: "moderate",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(buildBrief(c.input).verdict).toBe(c.verdict);
    });
  }
});

describe("buildBrief — headline tracks the verdict", () => {
  it("maps each verdict to a distinct headline", () => {
    const hard = buildBrief(
      make({
        recovery: { score: 80, band: "green" },
        acwr: { ratio: 1.0, status: "optimal" },
      }),
    );
    const rest = buildBrief(
      make({
        recovery: { score: 80, band: "green" },
        earlyWarning: { status: "alert", breachCount: 3, drivers: [] },
      }),
    );
    expect(hard.headline).toMatch(/hard/i);
    expect(rest.headline).toMatch(/rest/i);
    expect(hard.headline).not.toBe(rest.headline);
  });
});

describe("buildBrief — thin history", () => {
  it("flags low confidence and explains why", () => {
    const out = buildBrief(base);
    expect(out.lowConfidence).toBe(true);
    expect(ids(base)).toContain("confidence");
  });

  it("is not low-confidence once recovery is known", () => {
    const input = make({ recovery: { score: 70, band: "green" } });
    expect(buildBrief(input).lowConfidence).toBe(false);
    expect(ids(input)).not.toContain("confidence");
  });

  it("is not low-confidence once ACWR is known", () => {
    const input = make({ acwr: { ratio: 1.0, status: "optimal" } });
    expect(buildBrief(input).lowConfidence).toBe(false);
  });
});

describe("buildBrief — strain ceiling", () => {
  const train = {
    recovery: { score: 80, band: "green" as const },
    acwr: { ratio: 1.0, status: "optimal" as const },
  };

  it("reports a numeric ceiling below the WHOOP max", () => {
    const input = make({ ...train, strainCeiling: 13.4 });
    const out = buildBrief(input);
    expect(out.fullHeadroom).toBe(false);
    expect(reason(input, "ceiling")?.text).toMatch(/13\.4/);
  });

  it("flags full headroom when the ceiling exceeds the WHOOP max", () => {
    const input = make({ ...train, strainCeiling: 25 });
    const out = buildBrief(input);
    expect(out.fullHeadroom).toBe(true);
    expect(reason(input, "ceiling")?.text).toMatch(/full strain headroom/i);
  });

  it("omits the ceiling reason on thin history (null budget)", () => {
    const input = make({ ...train, strainCeiling: null });
    expect(ids(input)).not.toContain("ceiling");
  });

  it("omits the ceiling reason on a rest day", () => {
    const input = make({
      recovery: { score: 80, band: "green" },
      strainCeiling: 14,
      earlyWarning: { status: "alert", breachCount: 3, drivers: [] },
    });
    expect(buildBrief(input).verdict).toBe("rest");
    expect(ids(input)).not.toContain("ceiling");
  });
});

describe("buildBrief — reasons", () => {
  it("lists illness first when it fires", () => {
    const input = make({
      recovery: { score: 80, band: "green" },
      acwr: { ratio: 1.7, status: "elevated" },
      earlyWarning: {
        status: "watch",
        breachCount: 2,
        drivers: [{ label: "HRV", z: -1.6 }],
      },
    });
    expect(ids(input)[0]).toBe("illness");
  });

  it("surfaces the driving signals in the illness reason", () => {
    const input = make({
      earlyWarning: {
        status: "watch",
        breachCount: 2,
        drivers: [
          { label: "HRV", z: -1.8 },
          { label: "Skin temp", z: 1.6 },
        ],
      },
    });
    expect(reason(input, "illness")?.text).toContain("HRV z=-1.8");
    expect(reason(input, "illness")?.text).toContain("Skin temp z=+1.6");
  });

  it("notes a red tomorrow forecast without capping today", () => {
    const input = make({
      recovery: { score: 80, band: "green" },
      acwr: { ratio: 1.0, status: "optimal" },
      forecast: { score: 25, band: "red" },
    });
    const out = buildBrief(input);
    expect(out.verdict).toBe("hard");
    expect(reason(input, "forecast")?.tone).toBe("watch");
  });

  it("celebrates falling sleep debt", () => {
    const input = make({
      recovery: { score: 80, band: "green" },
      sleepDebtHours: { now: 2, trend: -2 },
    });
    expect(reason(input, "sleep")?.tone).toBe("good");
  });

  it("does not flag sleep when debt is moderate and steady", () => {
    const input = make({
      recovery: { score: 80, band: "green" },
      sleepDebtHours: { now: 2, trend: 0 },
    });
    expect(ids(input)).not.toContain("sleep");
  });
});
