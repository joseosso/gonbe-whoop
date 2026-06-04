import type { DaySeries } from "./types";

/**
 * Exponentially weighted moving average (SPEC §5): `s_t = α·x_t + (1−α)·s_{t−1}`,
 * α ≈ 0.2. Smoother than an SMA and reacts faster to recent values.
 *
 * Null-gap aware: a `null` day yields a `null` output (the line breaks where the
 * data does) and does **not** advance the state, so when real data resumes the
 * average blends from the value before the gap rather than restarting. The
 * first real value seeds the state.
 */
export function ewma(series: DaySeries, alpha = 0.2): DaySeries {
  if (!(alpha > 0 && alpha <= 1)) {
    throw new RangeError("alpha must be in (0, 1]");
  }

  let prev: number | null = null;
  return series.map(({ day, value }) => {
    if (value === null) return { day, value: null };
    prev = prev === null ? value : alpha * value + (1 - alpha) * prev;
    return { day, value: prev };
  });
}
