const MINUTES_PER_DAY = 1440;

/** Local bed and wake clock-minutes (0–1439) for one night. */
export interface ClockTimes {
  bedMinute: number;
  wakeMinute: number;
}

/** Sleep-regularity result. `index` is 0–100 (higher = more regular). */
export interface Regularity {
  index: number | null;
  /** Mean resultant length of bed times (0–1, higher = tighter). */
  bedR: number | null;
  /** Mean resultant length of wake times. */
  wakeR: number | null;
  n: number;
}

/**
 * Mean resultant length R of clock-minutes treated as points on a 24h circle
 * (so 23:50 and 00:10 are close, not 23h40m apart). R ∈ [0, 1]: 1 = identical
 * times, 0 = uniformly spread. `null` for fewer than 2 samples.
 */
function resultantLength(minutes: number[]): number | null {
  if (minutes.length < 2) return null;
  let cos = 0;
  let sin = 0;
  for (const m of minutes) {
    const angle = (2 * Math.PI * m) / MINUTES_PER_DAY;
    cos += Math.cos(angle);
    sin += Math.sin(angle);
  }
  return Math.hypot(cos, sin) / minutes.length;
}

/**
 * Sleep regularity index (SPEC §5): from the circular consistency of bed and
 * wake times. Combines the bed-time and wake-time resultant lengths into a
 * 0–100 score (higher = more regular). `index` is `null` for fewer than
 * `minN` nights.
 */
export function regularityIndex(nights: ClockTimes[], minN = 2): Regularity {
  const n = nights.length;
  if (n < minN) return { index: null, bedR: null, wakeR: null, n };

  const bedR = resultantLength(nights.map((x) => x.bedMinute));
  const wakeR = resultantLength(nights.map((x) => x.wakeMinute));
  if (bedR === null || wakeR === null) {
    return { index: null, bedR, wakeR, n };
  }
  return { index: ((bedR + wakeR) / 2) * 100, bedR, wakeR, n };
}
