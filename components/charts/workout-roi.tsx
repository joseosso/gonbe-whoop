import type { SportRoi } from "@/lib/analytics/workout-roi";
import { cn } from "@/lib/utils";

/** Signed fixed-precision number; explicit `+` for positives, `—` for null. */
function fmt(value: number | null, digits = 1): string {
  if (value === null) return "—";
  const s = value.toFixed(digits); // toFixed already prefixes ASCII '-'
  return value > 0 ? `+${s}` : s;
}

/**
 * Workout ROI (Plan §5.3). Ranks sport types by recovery cost per session —
 * next-day recovery vs baseline, per unit strain. Costliest sessions sit at the
 * top (red, below baseline); ones you recover easily from sit below (green).
 * Each row carries `n` and a low-confidence flag so thin samples are visible
 * rather than hidden behind a single number.
 */
export function WorkoutRoi({ data }: { data: SportRoi[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No workouts with a scored next-day recovery in range.
      </p>
    );
  }

  const maxAbs = Math.max(...data.map((r) => Math.abs(r.perStrain.mean ?? 0)));

  return (
    <ul className="flex flex-col gap-2">
      {data.map((roi) => (
        <SportRow key={roi.sport} roi={roi} maxAbs={maxAbs} />
      ))}
    </ul>
  );
}

function SportRow({ roi, maxAbs }: { roi: SportRoi; maxAbs: number }) {
  const perStrain = roi.perStrain.mean;
  const isCost = perStrain !== null && perStrain < 0;
  const width =
    perStrain === null || maxAbs === 0
      ? 0
      : Math.max(2, (Math.abs(perStrain) / maxAbs) * 100);

  return (
    <li className="flex flex-col gap-1 rounded-md border border-transparent p-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{roi.sport}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {fmt(perStrain)} rec/strain · n={roi.n}
          {roi.lowConfidence && (
            <span className="text-amber-600 dark:text-amber-400"> · low n</span>
          )}
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        {perStrain !== null && (
          <div
            className={cn(
              "h-full rounded-full",
              isCost ? "bg-destructive" : "bg-emerald-500",
            )}
            style={{ width: `${width}%` }}
          />
        )}
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        next-day recovery {fmt(roi.recoveryDelta.mean, 0)} vs baseline
        {roi.perKilojoule.mean !== null &&
          ` · ${fmt(roi.perKilojoule.mean)} rec/1k kJ`}
      </span>
    </li>
  );
}
