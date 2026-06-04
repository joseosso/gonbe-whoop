/** |z| at or above this is flagged as a meaningful deviation (SPEC §5). */
export const Z_THRESHOLD = 1.5;

/** The baseline a value is scored against. */
export interface Baseline {
  mean: number | null;
  sd: number | null;
}

/**
 * Z-score of `value` against a baseline: `(value − mean) / sd`. Returns `null`
 * when the baseline is undefined (`mean`/`sd` null) or `sd === 0` (no spread,
 * so deviation is undefined rather than infinite).
 */
export function zScore(value: number, { mean, sd }: Baseline): number | null {
  if (mean === null || sd === null || sd === 0) return null;
  return (value - mean) / sd;
}

/** Whether a z-score clears the meaningful-deviation threshold. */
export function isMeaningful(
  z: number | null,
  threshold = Z_THRESHOLD,
): boolean {
  return z !== null && Math.abs(z) >= threshold;
}
