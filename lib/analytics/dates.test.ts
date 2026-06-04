import { describe, expect, it } from "vitest";

import { toLocalDay } from "./dates";

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
