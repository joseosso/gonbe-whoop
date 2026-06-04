import { describe, expect, it } from "vitest";

import { buildDigest, type DigestInput } from "./digest";

/** A baseline input where every rule is dormant (emits no card). */
const base: DigestInput = {
  weekStart: "2024-06-03",
  recovery: { thisWeek: null, priorWeek: null },
  sleepDebtHours: { start: null, end: null },
  acwr: { ratio: null, status: null },
  dayOfWeek: null,
  tagDriver: null,
  anomalies: [],
  earlyWarning: null,
};

const card = (input: Partial<DigestInput>, id: string) =>
  buildDigest({ ...base, ...input }).cards.find((c) => c.id === id);

describe("buildDigest", () => {
  it("emits no cards when no inputs are present", () => {
    expect(buildDigest(base).cards).toEqual([]);
  });

  it("keeps the week start and a stable rule order", () => {
    const out = buildDigest({
      ...base,
      recovery: { thisWeek: 60, priorWeek: 50 },
      acwr: { ratio: 1.0, status: "optimal" },
      anomalies: [{ metric: "HRV", day: "2024-06-04", z: -1.8 }],
    });
    expect(out.weekStart).toBe("2024-06-03");
    expect(out.cards.map((c) => c.id)).toEqual([
      "recovery-trend",
      "acwr",
      "anomalies",
    ]);
  });

  describe("recovery trend", () => {
    it("flags a meaningful rise as positive", () => {
      const c = card({ recovery: { thisWeek: 62, priorWeek: 55 } }, "recovery-trend");
      expect(c?.severity).toBe("positive");
      expect(c?.title).toContain("up 7pp");
    });
    it("flags a meaningful drop as watch", () => {
      const c = card({ recovery: { thisWeek: 48, priorWeek: 60 } }, "recovery-trend");
      expect(c?.severity).toBe("watch");
      expect(c?.title).toContain("down 12pp");
    });
    it("treats small moves as steady/neutral", () => {
      const c = card({ recovery: { thisWeek: 61, priorWeek: 59 } }, "recovery-trend");
      expect(c?.severity).toBe("neutral");
    });
    it("handles a missing prior week", () => {
      const c = card({ recovery: { thisWeek: 70, priorWeek: null } }, "recovery-trend");
      expect(c?.severity).toBe("neutral");
      expect(c?.title).toContain("70%");
    });
  });

  describe("sleep debt", () => {
    it("reports a shrinking debt as positive", () => {
      const c = card({ sleepDebtHours: { start: 5, end: 3 } }, "sleep-debt");
      expect(c?.severity).toBe("positive");
      expect(c?.title).toContain("down 2h");
    });
    it("reports a growing debt as watch", () => {
      const c = card({ sleepDebtHours: { start: 2, end: 4 } }, "sleep-debt");
      expect(c?.severity).toBe("watch");
      expect(c?.title).toContain("up 2h");
    });
  });

  describe("acwr", () => {
    it("maps each band to the right severity", () => {
      expect(card({ acwr: { ratio: 1.0, status: "optimal" } }, "acwr")?.severity).toBe("positive");
      expect(card({ acwr: { ratio: 1.4, status: "high" } }, "acwr")?.severity).toBe("watch");
      expect(card({ acwr: { ratio: 1.7, status: "elevated" } }, "acwr")?.severity).toBe("alert");
      expect(card({ acwr: { ratio: 0.6, status: "low" } }, "acwr")?.severity).toBe("neutral");
    });
  });

  describe("day-of-week", () => {
    it("fires only when the effect clears the threshold", () => {
      expect(card({ dayOfWeek: { weekday: "Mon", delta: 2, n: 8 } }, "day-of-week")).toBeUndefined();
      const c = card({ dayOfWeek: { weekday: "Mon", delta: -6, n: 8 } }, "day-of-week");
      expect(c?.severity).toBe("watch");
      expect(c?.title).toContain("Mondays run 6pp below");
    });
  });

  describe("tag driver", () => {
    it("downgrades low-confidence drivers to neutral", () => {
      const c = card(
        { tagDriver: { tag: "travel", delta: -8, n: 2, lowConfidence: true } },
        "tag-driver",
      );
      expect(c?.severity).toBe("neutral");
      expect(c?.title).toContain("lower recovery");
    });
    it("ignores tiny effects", () => {
      expect(
        card({ tagDriver: { tag: "x", delta: 1, n: 9, lowConfidence: false } }, "tag-driver"),
      ).toBeUndefined();
    });
  });

  describe("early-warning", () => {
    it("stays silent when status is ok", () => {
      expect(
        card(
          { earlyWarning: { status: "ok", breachCount: 1, drivers: [] } },
          "early-warning",
        ),
      ).toBeUndefined();
    });
    it("flags a watch with the driving signals", () => {
      const c = card(
        {
          earlyWarning: {
            status: "watch",
            breachCount: 2,
            drivers: [
              { label: "Skin temp", z: 1.8 },
              { label: "HRV", z: -1.6 },
            ],
          },
        },
        "early-warning",
      );
      expect(c?.severity).toBe("watch");
      expect(c?.title).toContain("2 body-stress signals");
      expect(c?.detail).toContain("Skin temp (z=+1.8)");
      expect(c?.detail).toContain("HRV (z=-1.6)");
    });
    it("escalates to alert at three signals", () => {
      const c = card(
        {
          earlyWarning: {
            status: "alert",
            breachCount: 3,
            drivers: [{ label: "Resting HR", z: 2.1 }],
          },
        },
        "early-warning",
      );
      expect(c?.severity).toBe("alert");
    });
  });

  describe("anomalies", () => {
    it("escalates to alert for a large z", () => {
      const c = card(
        { anomalies: [{ metric: "RHR", day: "2024-06-05", z: 2.8 }] },
        "anomalies",
      );
      expect(c?.severity).toBe("alert");
    });
    it("stays watch for moderate anomalies", () => {
      const c = card(
        { anomalies: [{ metric: "HRV", day: "2024-06-05", z: -1.7 }] },
        "anomalies",
      );
      expect(c?.severity).toBe("watch");
      expect(c?.title).toContain("1 anomaly");
    });
  });
});
