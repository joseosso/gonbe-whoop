import { format, isValid, parseISO, subDays } from "date-fns";

import type { Day, DayRange, EventRow } from "@/lib/analytics/types";

/** Default look-back window when the URL carries no (valid) range. */
export const DEFAULT_RANGE_DAYS = 90;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A well-formed, real calendar day string (`YYYY-MM-DD`). */
export function isValidDay(value: string | undefined): value is Day {
  return value !== undefined && DAY_RE.test(value) && isValid(parseISO(value));
}

/** The default range: the trailing `DEFAULT_RANGE_DAYS` days, ending today. */
export function defaultRange(): DayRange {
  const today = new Date();
  return {
    from: format(subDays(today, DEFAULT_RANGE_DAYS - 1), "yyyy-MM-dd"),
    to: format(today, "yyyy-MM-dd"),
  };
}

/**
 * Resolve a `DayRange` from URL params, falling back to the default for either
 * bound when missing/invalid, and swapping reversed bounds so `from <= to`.
 * Used on both the server (page `searchParams`) and the client (picker), so a
 * range is always deep-linkable and consistent.
 */
export function parseRange(params: { from?: string; to?: string }): DayRange {
  const fallback = defaultRange();
  let from = isValidDay(params.from) ? params.from : fallback.from;
  let to = isValidDay(params.to) ? params.to : fallback.to;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

/**
 * Clamp each event's span to `range` so its days line up with a chart's day
 * axis. Lexicographic compare works for `YYYY-MM-DD`. (`getEvents` already
 * returns only events overlapping the range.)
 */
export function clampEventsToRange(
  events: EventRow[],
  range: DayRange,
): EventRow[] {
  return events.map((e) => ({
    ...e,
    startDay: e.startDay < range.from ? range.from : e.startDay,
    endDay: e.endDay
      ? e.endDay > range.to
        ? range.to
        : e.endDay
      : null,
  }));
}

/** Human label for a range, e.g. `"Jun 1 – Aug 30, 2024"`. */
export function formatRangeLabel(range: DayRange): string {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${format(from, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(
    to,
    "MMM d, yyyy",
  )}`;
}
