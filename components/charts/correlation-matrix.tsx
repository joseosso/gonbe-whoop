import type { DriverCorrelation } from "@/lib/analytics/correlate";
import { cn } from "@/lib/utils";

/** Coarse effect-size label for |r| (Cohen-style bands). */
function strength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "negligible";
  if (a < 0.3) return "weak";
  if (a < 0.5) return "moderate";
  return "strong";
}

/**
 * Ranked lagged-correlation drivers (Plan §4.5). One diverging bar per
 * predictor: length = |r|, side = sign (right raises the outcome, left lowers
 * it). Confident relationships are solid; low-confidence ones (thin or
 * non-significant) are muted and labelled, so weak evidence is visible, not
 * hidden — "what actually moves your recovery", honestly ranked.
 */
export function CorrelationMatrix({
  drivers,
  outcomeLabel,
}: {
  drivers: DriverCorrelation[];
  outcomeLabel: string;
}) {
  if (drivers.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough overlapping history yet to rank drivers.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {drivers.map((d) => (
        <DriverRow key={d.key} driver={d} outcomeLabel={outcomeLabel} />
      ))}
    </ul>
  );
}

function DriverRow({
  driver,
  outcomeLabel,
}: {
  driver: DriverCorrelation;
  outcomeLabel: string;
}) {
  const r = driver.r as number;
  const positive = r >= 0;
  // Diverging bar around a centre line: width = |r|·50% of the track.
  const widthPct = Math.abs(r) * 50;
  const leftPct = positive ? 50 : 50 - widthPct;
  const barColor = driver.lowConfidence
    ? "bg-muted-foreground/40"
    : positive
      ? "bg-emerald-500"
      : "bg-amber-500";

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {driver.label}
          {driver.hint && (
            <span className="text-muted-foreground font-normal"> · {driver.hint}</span>
          )}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          r {r >= 0 ? "+" : ""}
          {r.toFixed(2)} · n={driver.n}
        </span>
      </div>

      <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
        {/* centre line */}
        <div className="bg-border absolute inset-y-0 left-1/2 w-px" />
        <div
          className={cn("absolute inset-y-0 rounded-full", barColor)}
          style={{ left: `${leftPct}%`, width: `${Math.max(1, widthPct)}%` }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {strength(r)} {positive ? "positive" : "negative"} link —{" "}
        {driver.lag > 0
          ? `${driver.lag === 1 ? "next-day" : `+${driver.lag}d`} `
          : "same-day "}
        {outcomeLabel}.
        {driver.lowConfidence && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            Low confidence{driver.n < 8 ? " (small sample)" : " (not significant)"}.
          </span>
        )}
      </p>
    </li>
  );
}
