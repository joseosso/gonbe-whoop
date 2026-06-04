/** A day's strain is "high" at or above this (WHOOP strain scale is 0–21). */
export const HIGH_STRAIN = 14;
/** Recovery is "low" at or below this (WHOOP red zone). */
export const LOW_RECOVERY = 34;

export interface StrainRecoveryInput {
  day: string;
  strain: number;
  recovery: number;
}

export interface StrainRecoveryPoint extends StrainRecoveryInput {
  /** High strain on a low-recovery day — the quadrant to watch. */
  flagged: boolean;
}

/**
 * Flag high-strain-on-low-recovery days (SPEC §5 strain–recovery balance).
 * A day is flagged when strain ≥ `highStrain` and recovery ≤ `lowRecovery`.
 */
export function flagStrainRecovery(
  rows: StrainRecoveryInput[],
  {
    highStrain = HIGH_STRAIN,
    lowRecovery = LOW_RECOVERY,
  }: { highStrain?: number; lowRecovery?: number } = {},
): StrainRecoveryPoint[] {
  return rows.map((r) => ({
    ...r,
    flagged: r.strain >= highStrain && r.recovery <= lowRecovery,
  }));
}
