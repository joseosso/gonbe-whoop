import { recoveryBand } from "@/lib/analytics/forecast";
import type { BedtimeOptimizer, BedtimeWindow } from "@/lib/analytics/sleep-timing";
import { cn } from "@/lib/utils";

/** Recovery band → bar colour, reusing the forecast's band thresholds. */
const BAND_BAR: Record<ReturnType<typeof recoveryBand>, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-destructive",
};

const pct = (share: number | null) =>
  share === null ? "—" : `${Math.round(share * 100)}%`;

/**
 * Ideal-bedtime optimizer (Plan §4.4). Recommends the bed-time window that
 * precedes your best recovery, then lists every window with its mean recovery
 * (bar), deep/REM share, and `n` so the evidence — and small samples — are
 * visible rather than hidden behind a single number.
 */
export function BedtimeOptimizer({ optimizer }: { optimizer: BedtimeOptimizer }) {
  const { windows, best, lowConfidence } = optimizer;

  if (windows.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough nights yet to compare bedtimes.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {best ? (
        <div>
          <p className="text-muted-foreground text-xs">Best bedtime window</p>
          <p className="text-3xl font-semibold tabular-nums">{best.label}</p>
          <p className="text-muted-foreground text-xs">
            Your strongest recovery follows this window — avg{" "}
            {Math.round(best.recovery.mean as number)}% over {best.recovery.n}{" "}
            night{best.recovery.n === 1 ? "" : "s"}.
            {lowConfidence && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                Few nights so far — treat as a hint.
              </span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Not enough scored nights in any single window to recommend one yet —
          the breakdown below is still forming.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {windows.map((w) => (
          <WindowRow key={w.startMinute} window={w} isBest={w === best} />
        ))}
      </ul>
    </div>
  );
}

function WindowRow({
  window,
  isBest,
}: {
  window: BedtimeWindow;
  isBest: boolean;
}) {
  const mean = window.recovery.mean;
  const band = mean === null ? null : recoveryBand(mean);
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-md border p-2",
        isBest ? "border-emerald-500/50 bg-emerald-500/5" : "border-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">{window.label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {mean === null ? "no recovery yet" : `${Math.round(mean)}% rec`} · n=
          {window.n}
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        {mean !== null && band && (
          <div
            className={`h-full rounded-full ${BAND_BAR[band]}`}
            style={{ width: `${Math.max(2, Math.min(100, mean))}%` }}
          />
        )}
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        deep {pct(window.deepShare.mean)} · REM {pct(window.remShare.mean)}
      </span>
    </li>
  );
}
