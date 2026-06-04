import { formatInTimeZone } from "date-fns-tz";

import type { Day } from "./types";

/** WHOOP records carry a fixed UTC offset; absent one we fall back to UTC. */
const UTC_OFFSET = "+00:00";

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
