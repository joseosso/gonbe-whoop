import { meanStdev, type Stats } from "./baseline";
import { localClockMinutes } from "./dates";

/**
 * Ideal-bedtime / sleep-timing optimizer (Plan §4.4). Buckets nights by bed-time
 * clock-minute window, then reports the mean **next-morning** recovery and
 * deep/REM share per window (driver-style continuous bins). The window that
 * precedes the best recovery is recommended, with `n` and spread per window so
 * small samples are flagged rather than over-claimed (SPEC §5 honesty). Pure —
 * the Sleep page joins sleep + recovery and renders the result.
 */

const MINUTES_PER_DAY = 1440;
/** Bedtimes before noon are treated as "after midnight" so the night axis is
 * continuous (23:30 and 00:30 sit in adjacent bins, not ~24h apart). */
const NOON = 720;

/** Default bedtime bin width (minutes). */
export const TIMING_BIN_MINUTES = 30;
/** A window needs at least this many scored nights to be recommendable. */
export const TIMING_MIN_N = 3;
/** Below this many nights, the recommendation is flagged low-confidence. */
export const TIMING_CONFIDENT_N = 5;

/** One night reduced to the inputs the optimizer needs. */
export interface TimingNight {
  /** Local clock-minute of bed-time (0–1439). */
  bedMinute: number;
  /** Recovery the night produced (0–100), or `null` if unscored. */
  recovery: number | null;
  /** Deep (SWS) share of asleep time, 0–1, or `null`. */
  deepShare: number | null;
  /** REM share of asleep time, 0–1, or `null`. */
  remShare: number | null;
}

/** A bedtime window and the outcomes of nights that started within it. */
export interface BedtimeWindow {
  /** Display clock-minute (0–1439) of the window start. */
  startMinute: number;
  widthMinute: number;
  /** `"HH:MM–HH:MM"` clock label. */
  label: string;
  /** Total nights in the window (incl. ones with no recovery score). */
  n: number;
  /** Recovery stats (mean/sd over scored nights). */
  recovery: Stats;
  deepShare: Stats;
  remShare: Stats;
}

/** The optimizer result: per-window stats + the recommended window. */
export interface BedtimeOptimizer {
  /** Windows in chronological (night-axis) order. */
  windows: BedtimeWindow[];
  /** Highest-mean-recovery window with `≥ minN` scored nights, or `null`. */
  best: BedtimeWindow | null;
  /** True when there's no eligible window or the best rests on a thin sample. */
  lowConfidence: boolean;
}

/** Map a clock-minute onto the continuous night axis (evening → after midnight). */
const nightMinute = (m: number): number => (m < NOON ? m + MINUTES_PER_DAY : m);

/** Clock label `"HH:MM"` for a (possibly > 1440) night-axis minute. */
function clockLabel(min: number): string {
  const m = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const nonNull = (v: number | null): v is number => v !== null;

/**
 * Group nights into fixed-width bedtime windows, with recovery + deep/REM stats
 * per window. Windows are returned in night-axis order; empty bins are omitted.
 */
export function bedtimeWindows(
  nights: TimingNight[],
  { binMinutes = TIMING_BIN_MINUTES }: { binMinutes?: number } = {},
): BedtimeWindow[] {
  const bins = new Map<number, TimingNight[]>();
  for (const night of nights) {
    const idx = Math.floor(nightMinute(night.bedMinute) / binMinutes);
    const group = bins.get(idx);
    if (group) group.push(night);
    else bins.set(idx, [night]);
  }

  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, group]) => {
      const startNight = idx * binMinutes;
      return {
        startMinute: startNight % MINUTES_PER_DAY,
        widthMinute: binMinutes,
        label: `${clockLabel(startNight)}–${clockLabel(startNight + binMinutes)}`,
        n: group.length,
        recovery: meanStdev(group.map((g) => g.recovery).filter(nonNull)),
        deepShare: meanStdev(group.map((g) => g.deepShare).filter(nonNull)),
        remShare: meanStdev(group.map((g) => g.remShare).filter(nonNull)),
      };
    });
}

/**
 * Recommend the bedtime window that precedes the best recovery. Only windows
 * with `≥ minN` scored nights are eligible; the recommendation is flagged
 * low-confidence when none qualify or the best rests on fewer than `confidentN`
 * nights.
 */
export function recommendBedtime(
  nights: TimingNight[],
  {
    binMinutes = TIMING_BIN_MINUTES,
    minN = TIMING_MIN_N,
    confidentN = TIMING_CONFIDENT_N,
  }: { binMinutes?: number; minN?: number; confidentN?: number } = {},
): BedtimeOptimizer {
  const windows = bedtimeWindows(nights, { binMinutes });
  const eligible = windows.filter(
    (w) => w.recovery.mean !== null && w.recovery.n >= minN,
  );
  const best = eligible.length
    ? eligible.reduce((a, b) =>
        (b.recovery.mean as number) > (a.recovery.mean as number) ? b : a,
      )
    : null;
  const lowConfidence = best === null || best.recovery.n < confidentN;
  return { windows, best, lowConfidence };
}

/** Share of one stage in the asleep total, or `null` when not computable. */
const share = (part: number | null, asleep: number | null): number | null =>
  part !== null && asleep !== null && asleep > 0 ? part / asleep : null;

/**
 * One sleep night already paired with the recovery it produced. The pairing is
 * done upstream via WHOOP's stored `sleep_id` FK (see `getBedtimeNights`), **not**
 * by recomputed local day — so a night and its recovery stay matched across DST
 * and timezone changes, where the sleep's wake-day offset and the recovery
 * cycle's offset can otherwise diverge.
 */
export interface BedtimeNightInput {
  /** Sleep onset instant. */
  startTime: Date;
  /** The sleep record's fixed UTC offset (for the local bed-time clock-minute). */
  tzOffset: string | null;
  lightMilli: number | null;
  swsMilli: number | null;
  remMilli: number | null;
  /** Recovery score this night produced (via `sleep_id`), or `null`. */
  recoveryScore: number | null;
}

/**
 * Reduce FK-paired sleep nights into `TimingNight`s: bed-time clock-minute, the
 * recovery the night produced, and deep/REM share of asleep time. Naps are
 * already excluded upstream by `getBedtimeNights`.
 */
export function buildTimingNights(nights: BedtimeNightInput[]): TimingNight[] {
  return nights.map((s) => {
    const asleep =
      s.lightMilli === null && s.swsMilli === null && s.remMilli === null
        ? null
        : (s.lightMilli ?? 0) + (s.swsMilli ?? 0) + (s.remMilli ?? 0);
    return {
      bedMinute: localClockMinutes(s.startTime, s.tzOffset),
      recovery: s.recoveryScore,
      deepShare: share(s.swsMilli, asleep),
      remShare: share(s.remMilli, asleep),
    };
  });
}
