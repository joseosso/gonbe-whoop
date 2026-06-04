import { describe, expect, it } from "vitest";

import {
  bedtimeWindows,
  buildTimingNights,
  recommendBedtime,
  type TimingNight,
} from "./sleep-timing";
import type { RecoveryDay, SleepDay } from "./types";

/** Clock "HH:MM" → minute-of-day. */
const at = (hh: number, mm = 0) => hh * 60 + mm;

const night = (
  bedMinute: number,
  recovery: number | null,
  deepShare: number | null = null,
  remShare: number | null = null,
): TimingNight => ({ bedMinute, recovery, deepShare, remShare });

describe("bedtimeWindows", () => {
  it("buckets nights into fixed-width windows in chronological order", () => {
    const windows = bedtimeWindows(
      [
        night(at(22, 30), 70),
        night(at(22, 45), 72),
        night(at(23, 30), 50),
        night(at(0, 30), 40), // after midnight → last bin
      ],
      { binMinutes: 60 },
    );
    expect(windows.map((w) => w.label)).toEqual([
      "22:00–23:00",
      "23:00–00:00",
      "00:00–01:00",
    ]);
    expect(windows[0].n).toBe(2);
    expect(windows[0].recovery.mean).toBeCloseTo(71);
  });

  it("orders a post-midnight bedtime after an evening one (continuous axis)", () => {
    const windows = bedtimeWindows([night(at(0, 30), 40), night(at(23, 30), 50)], {
      binMinutes: 60,
    });
    expect(windows.map((w) => w.label)).toEqual(["23:00–00:00", "00:00–01:00"]);
  });

  it("counts a null-recovery night in n but not in the recovery stats", () => {
    const windows = bedtimeWindows([night(at(23, 0), 60), night(at(23, 10), null)], {
      binMinutes: 60,
    });
    expect(windows[0].n).toBe(2);
    expect(windows[0].recovery.n).toBe(1);
    expect(windows[0].recovery.mean).toBe(60);
  });
});

describe("recommendBedtime", () => {
  it("recommends the window with the highest mean recovery (n ≥ minN)", () => {
    const nights = [
      ...Array(5).fill(null).map(() => night(at(22, 15), 75)), // strong
      ...Array(5).fill(null).map(() => night(at(0, 30), 45)), // weak
    ];
    const { best, lowConfidence } = recommendBedtime(nights, {
      binMinutes: 60,
      minN: 3,
      confidentN: 5,
    });
    expect(best?.label).toBe("22:00–23:00");
    expect(best?.recovery.mean).toBeCloseTo(75);
    expect(lowConfidence).toBe(false);
  });

  it("ignores windows below minN when picking the best", () => {
    const nights = [
      night(at(22, 0), 90), // lone high night — n=1, ineligible
      ...Array(4).fill(null).map(() => night(at(23, 30), 60)),
    ];
    const { best } = recommendBedtime(nights, { binMinutes: 60, minN: 3 });
    expect(best?.label).toBe("23:00–00:00");
  });

  it("flags low confidence when the best window is a thin sample", () => {
    const nights = Array(3)
      .fill(null)
      .map(() => night(at(22, 30), 70));
    const { best, lowConfidence } = recommendBedtime(nights, {
      binMinutes: 60,
      minN: 3,
      confidentN: 5,
    });
    expect(best?.label).toBe("22:00–23:00");
    expect(lowConfidence).toBe(true); // 3 nights < confidentN
  });

  it("returns a null best (low confidence) when nothing clears minN", () => {
    const { best, lowConfidence } = recommendBedtime(
      [night(at(22, 0), 70), night(at(1, 0), 50)],
      { binMinutes: 60, minN: 3 },
    );
    expect(best).toBeNull();
    expect(lowConfidence).toBe(true);
  });
});

describe("buildTimingNights", () => {
  const sleep = (
    day: string,
    bedHour: number,
    stages: { light: number; sws: number; rem: number } | null,
  ): SleepDay =>
    ({
      day,
      // 2024-03-02 bedHour:00 UTC; tzOffset +00:00 keeps the clock-minute simple.
      startTime: new Date(`2024-03-02T${String(bedHour).padStart(2, "0")}:00:00Z`),
      tzOffset: "+00:00",
      lightMilli: stages?.light ?? null,
      swsMilli: stages?.sws ?? null,
      remMilli: stages?.rem ?? null,
    }) as SleepDay;

  const recovery = (day: string, score: number | null): RecoveryDay =>
    ({ day, recoveryScore: score }) as RecoveryDay;

  it("joins recovery on the wake day and computes stage shares", () => {
    const nights = buildTimingNights(
      [sleep("2024-03-03", 23, { light: 50, sws: 25, rem: 25 })],
      [recovery("2024-03-03", 66)],
    );
    expect(nights[0].bedMinute).toBe(23 * 60);
    expect(nights[0].recovery).toBe(66);
    expect(nights[0].deepShare).toBeCloseTo(0.25); // 25 / (50+25+25)
    expect(nights[0].remShare).toBeCloseTo(0.25);
  });

  it("null-guards a missing recovery and absent stages", () => {
    const nights = buildTimingNights(
      [sleep("2024-03-03", 22, null)],
      [], // no recovery for the wake day
    );
    expect(nights[0].recovery).toBeNull();
    expect(nights[0].deepShare).toBeNull();
    expect(nights[0].remShare).toBeNull();
  });
});
