import { describe, expect, it } from "vitest";

import {
  densify,
  eachDay,
  localClockMinutes,
  toLocalDay,
  weekdayIndex,
  weekdayName,
} from "./dates";

describe("toLocalDay", () => {
  it("buckets by UTC when the offset is +00:00", () => {
    expect(toLocalDay(new Date("2024-06-15T12:00:00Z"), "+00:00")).toBe(
      "2024-06-15",
    );
  });

  it("falls back to UTC when the offset is null", () => {
    expect(toLocalDay(new Date("2024-06-15T12:00:00Z"), null)).toBe(
      "2024-06-15",
    );
  });

  it("rolls back across midnight for a negative offset", () => {
    // 05:00Z − 08:00 = 21:00 the previous day.
    expect(toLocalDay(new Date("2024-06-15T05:00:00Z"), "-08:00")).toBe(
      "2024-06-14",
    );
  });

  it("rolls forward across midnight for a positive offset", () => {
    // 23:00Z + 02:00 = 01:00 the next day.
    expect(toLocalDay(new Date("2024-06-15T23:00:00Z"), "+02:00")).toBe(
      "2024-06-16",
    );
  });

  it("uses each record's own offset across a DST fall-back", () => {
    // US Pacific falls back 2024-11-03 02:00: a cycle before the change carries
    // -07:00 (PDT), one after carries -08:00 (PST). Both 00:30 local → same day.
    expect(toLocalDay(new Date("2024-11-03T07:30:00Z"), "-07:00")).toBe(
      "2024-11-03",
    );
    expect(toLocalDay(new Date("2024-11-03T08:30:00Z"), "-08:00")).toBe(
      "2024-11-03",
    );
  });

  it("handles half-hour offsets", () => {
    // 23:00Z + 05:30 = 04:30 the next day.
    expect(toLocalDay(new Date("2024-06-15T23:00:00Z"), "+05:30")).toBe(
      "2024-06-16",
    );
  });
});

describe("localClockMinutes", () => {
  it("returns local minute-of-day, applying the offset", () => {
    // 05:30Z − 08:00 = 21:30 local → 1290.
    expect(
      localClockMinutes(new Date("2024-06-15T05:30:00Z"), "-08:00"),
    ).toBe(21 * 60 + 30);
    // 23:30Z + 02:00 = 01:30 local → 90.
    expect(
      localClockMinutes(new Date("2024-06-15T23:30:00Z"), "+02:00"),
    ).toBe(90);
    // null offset → UTC.
    expect(localClockMinutes(new Date("2024-06-15T07:15:00Z"), null)).toBe(
      7 * 60 + 15,
    );
  });
});

describe("eachDay", () => {
  it("enumerates an inclusive range across a leap day", () => {
    expect(eachDay({ from: "2024-02-27", to: "2024-03-02" })).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29", // 2024 is a leap year
      "2024-03-01",
      "2024-03-02",
    ]);
  });

  it("returns a single day when from === to", () => {
    expect(eachDay({ from: "2024-06-15", to: "2024-06-15" })).toEqual([
      "2024-06-15",
    ]);
  });
});

describe("densify", () => {
  it("fills missing days with null and preserves zeros", () => {
    expect(
      densify(
        [
          { day: "2024-03-01", value: 0 },
          { day: "2024-03-03", value: 7 },
        ],
        { from: "2024-03-01", to: "2024-03-03" },
      ),
    ).toEqual([
      { day: "2024-03-01", value: 0 },
      { day: "2024-03-02", value: null },
      { day: "2024-03-03", value: 7 },
    ]);
  });
});

describe("weekday helpers", () => {
  it("maps days to weekday index and label", () => {
    expect(weekdayIndex("2024-06-16")).toBe(0); // Sunday
    expect(weekdayName("2024-06-16")).toBe("Sun");
    expect(weekdayIndex("2024-06-17")).toBe(1); // Monday
    expect(weekdayName("2024-06-17")).toBe("Mon");
  });
});
