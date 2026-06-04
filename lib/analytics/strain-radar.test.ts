import { describe, expect, it } from "vitest";

import {
  buildRadar,
  buildRadarSignals,
  RADAR_ALERT_MIN,
  type AdverseDirection,
  type RadarSignal,
} from "./strain-radar";
import type { DaySeries, RecoveryDay, SleepDay } from "./types";

// A 4-day baseline of [8,12,8,12] has mean 10, sd ≈ 2.309; the 5th point is the
// "latest" scored against it. latest 15 → z ≈ +2.16; latest 5 → z ≈ −2.16.
const W = 4;
const withLatest = (latest: number | null): DaySeries =>
  [8, 12, 8, 12, latest].map((value, i) => ({
    day: `2024-02-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

const signal = (
  key: string,
  adverse: AdverseDirection,
  latest: number | null,
): RadarSignal => ({ key, label: key, adverse, series: withLatest(latest) });

const nullSignal = (key: string): RadarSignal => ({
  key,
  label: key,
  adverse: "high",
  series: withLatest(0).map((p) => ({ ...p, value: null })),
});

const radar = (signals: RadarSignal[]) => buildRadar(signals, { window: W });

describe("buildRadar — direction awareness", () => {
  it("breaches a `high` signal only on an upward deviation", () => {
    expect(radar([signal("a", "high", 15)]).readings[0].breached).toBe(true);
    expect(radar([signal("a", "high", 5)]).readings[0].breached).toBe(false);
  });

  it("breaches a `low` signal only on a downward deviation", () => {
    expect(radar([signal("a", "low", 5)]).readings[0].breached).toBe(true);
    expect(radar([signal("a", "low", 15)]).readings[0].breached).toBe(false);
  });

  it("does not breach a value sitting on its baseline", () => {
    expect(radar([signal("a", "high", 10)]).readings[0].breached).toBe(false);
  });
});

describe("buildRadar — fusion & severity", () => {
  it("a single breach does not flag the day (status ok)", () => {
    const r = radar([
      signal("a", "high", 15), // breach
      signal("b", "high", 10), // calm
      signal("c", "low", 10), // calm
    ]);
    expect(r.breachCount).toBe(1);
    expect(r.status).toBe("ok");
    expect(r.drivers).toHaveLength(1);
  });

  it("two breaches flag a watch", () => {
    const r = radar([
      signal("a", "high", 15),
      signal("b", "low", 5),
      signal("c", "high", 10),
    ]);
    expect(r.breachCount).toBe(2);
    expect(r.status).toBe("watch");
  });

  it("three or more breaches escalate to alert", () => {
    const r = radar([
      signal("a", "high", 15),
      signal("b", "low", 5),
      signal("c", "high", 15),
    ]);
    expect(r.breachCount).toBe(RADAR_ALERT_MIN);
    expect(r.status).toBe("alert");
  });

  it("ranks drivers most-adverse first", () => {
    const r = radar([
      signal("mild", "high", 14), // smaller z
      signal("hot", "high", 18), // larger z
    ]);
    expect(r.drivers.map((d) => d.key)).toEqual(["hot", "mild"]);
  });
});

describe("buildRadar — null guards", () => {
  it("treats an all-null signal as no data, not a breach", () => {
    const r = radar([nullSignal("a")]);
    const reading = r.readings[0];
    expect(reading.value).toBeNull();
    expect(reading.z).toBeNull();
    expect(reading.adverseZ).toBeNull();
    expect(reading.breached).toBe(false);
    expect(r.status).toBe("ok");
  });

  it("yields a null z (no breach) when the baseline has no spread", () => {
    const flat: DaySeries = [10, 10, 10, 10, 15].map((value, i) => ({
      day: `2024-02-0${i + 1}`,
      value,
    }));
    const r = buildRadar([{ key: "a", label: "a", adverse: "high", series: flat }], {
      window: W,
    });
    expect(r.readings[0].z).toBeNull();
    expect(r.readings[0].breached).toBe(false);
  });

  it("anchors the day on the most recent signal with data", () => {
    const r = radar([signal("a", "high", 15), signal("b", "low", 5)]);
    expect(r.day).toBe("2024-02-05");
  });

  it("reports a null day when nothing has data", () => {
    expect(radar([nullSignal("a")]).day).toBeNull();
  });
});

describe("buildRadarSignals", () => {
  const range = { from: "2024-03-01", to: "2024-03-03" };
  const recovery: RecoveryDay[] = [
    {
      day: "2024-03-02",
      recoveryScore: 60,
      restingHr: 55,
      hrvRmssdMilli: 80,
      spo2: 97,
      skinTempC: 33.5,
    },
  ];
  const sleep = [
    { day: "2024-03-02", respiratoryRate: 15 } as SleepDay,
  ];

  it("maps the five signals with their adverse directions", () => {
    const signals = buildRadarSignals(recovery, sleep, range);
    expect(signals.map((s) => [s.key, s.adverse])).toEqual([
      ["skinTemp", "high"],
      ["restingHr", "high"],
      ["hrv", "low"],
      ["spo2", "low"],
      ["respRate", "high"],
    ]);
  });

  it("densifies each signal to one point per day in range", () => {
    const signals = buildRadarSignals(recovery, sleep, range);
    for (const s of signals) {
      expect(s.series.map((p) => p.day)).toEqual([
        "2024-03-01",
        "2024-03-02",
        "2024-03-03",
      ]);
    }
    // Respiratory rate is sourced from sleep, present only on the 2nd.
    expect(signals[4].series[1].value).toBe(15);
    expect(signals[4].series[0].value).toBeNull();
  });
});
