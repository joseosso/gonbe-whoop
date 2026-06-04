import { formatInTimeZone } from "date-fns-tz";

import type { Day, DayRange, DaySeries } from "./types";

/** WHOOP records carry a fixed UTC offset; absent one we fall back to UTC. */
const UTC_OFFSET = "+00:00";
const MS_PER_DAY = 86_400_000;

/**
 * The local calendar day (`YYYY-MM-DD`) an instant falls on, using the record's
 * fixed UTC `tzOffset` (e.g. `"-08:00"`) rather than UTC. Each WHOOP record
 * carries its own offset, so a DST change is handled naturally: consecutive
 * records simply report different offsets (`-08:00` → `-07:00`) and bucket to
 * the day you actually experienced.
 */
export function toLocalDay(instant: Date, tzOffset: string | null): Day {
  return formatInTimeZone(instant, tzOffset ?? UTC_OFFSET, "yyyy-MM-dd");
}

/**
 * Local clock minute-of-day (0–1439) for an instant, using the record's fixed
 * `tzOffset`. Used by the sleep-regularity formula to compare bed/wake times.
 */
export function localClockMinutes(
  instant: Date,
  tzOffset: string | null,
): number {
  const [h, m] = formatInTimeZone(instant, tzOffset ?? UTC_OFFSET, "HH:mm")
    .split(":")
    .map(Number);
  return h * 60 + m;
}

/** Anchor a `YYYY-MM-DD` day at midnight UTC, so day math is DST-immune. */
const dayToUtc = (day: Day): Date => new Date(`${day}T00:00:00.000Z`);

/** The calendar day after `day` (DST-immune: steps a fixed 24h at midnight UTC). */
export function nextDay(day: Day): Day {
  return shiftDay(day, 1);
}

/** The calendar day `n` days from `day` (DST-immune; `n` may be negative). */
export function shiftDay(day: Day, n: number): Day {
  return new Date(dayToUtc(day).getTime() + n * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** Every calendar day in `range`, inclusive, ascending. */
export function eachDay(range: DayRange): Day[] {
  const out: Day[] = [];
  const end = dayToUtc(range.to).getTime();
  // UTC has no DST, so stepping a fixed 24h keeps the time-of-day at midnight.
  for (let t = dayToUtc(range.from).getTime(); t <= end; t += MS_PER_DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Expand a sparse series into a dense one with exactly one point per day in
 * `range`; missing days become `value: null`. Trailing-window analytics
 * (baseline, EWMA) rely on this so a positional window equals a calendar
 * window. `0` values are preserved (only absent days become `null`).
 */
export function densify(series: DaySeries, range: DayRange): DaySeries {
  const values = new Map(series.map((p) => [p.day, p.value]));
  return eachDay(range).map((day) => ({
    day,
    value: values.get(day) ?? null,
  }));
}

/** Weekday labels indexed by `Date.getUTCDay()` (0 = Sun … 6 = Sat). */
export const WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Weekday index (0 = Sun … 6 = Sat) for a local day. */
export function weekdayIndex(day: Day): number {
  return dayToUtc(day).getUTCDay();
}

/** Weekday label (`"Mon"`, …) for a local day. */
export function weekdayName(day: Day): Weekday {
  return WEEKDAYS[weekdayIndex(day)];
}
