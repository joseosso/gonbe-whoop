import { ArrowDown, ArrowUp } from "lucide-react";
import { format, parseISO } from "date-fns";

import type {
  BacktestResult,
  ForecastPoint,
  RecoveryBand,
} from "@/lib/analytics/forecast";

/** Band → accent colour + label. */
const BAND_META: Record<
  RecoveryBand,
  { label: string; dot: string; text: string }
> = {
  green: {
    label: "Green",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    label: "Amber",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  red: { label: "Red", dot: "bg-destructive", text: "text-destructive" },
};

/**
 * Tomorrow's recovery forecast (Plan §4.3). Shows the predicted band + score for
 * the next day, the drivers pushing it up or down (explainable, not a black
 * box), and the model's own backtested accuracy so the prediction isn't
 * over-claimed.
 */
export function RecoveryForecast({
  forecast,
  backtest,
}: {
  forecast: ForecastPoint | null;
  backtest: BacktestResult;
}) {
  if (!forecast || forecast.score === null || forecast.band === null) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough history yet — the forecast needs ~30 days of recovery, strain,
        and sleep.
      </p>
    );
  }

  const meta = BAND_META[forecast.band];
  const forLabel = format(parseISO(forecast.forDay), "EEE, MMM d");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className={`size-3 rounded-full ${meta.dot}`} aria-hidden />
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold ${meta.text}`}>
            {meta.label}
          </span>
          <span className="text-3xl font-semibold tabular-nums">
            ~{Math.round(forecast.score)}
            <span className="text-muted-foreground text-base">%</span>
          </span>
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Predicted recovery for {forLabel}.
      </p>

      {forecast.drivers.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {forecast.drivers.slice(0, 3).map((d) => {
            // effect > 0 raises predicted recovery (helping), < 0 lowers it.
            const helping = d.effect > 0;
            const Arrow = helping ? ArrowUp : ArrowDown;
            const tone = helping
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400";
            return (
              <li key={d.key} className="flex items-center gap-1.5">
                <Arrow className={`size-3 ${tone}`} />
                <span className="text-foreground">{d.label}</span>
                <span className="text-muted-foreground">
                  {helping ? "lifting" : "pressing"} recovery
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs">
        {backtest.n > 0 && backtest.mae !== null
          ? `Backtest: ±${Math.round(backtest.mae)} pts, ${Math.round(
              (backtest.bandHitRate ?? 0) * 100,
            )}% band hit rate over ${backtest.n} days.`
          : "Accuracy builds as more history accrues."}
      </p>
    </div>
  );
}
