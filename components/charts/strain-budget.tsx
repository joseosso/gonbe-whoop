"use client";

import { useState } from "react";

import {
  acwrStatus,
  projectAcwr,
  strainBudget,
  WHOOP_STRAIN_MAX,
  type AcwrStatus,
  type PriorLoads,
} from "@/lib/analytics/acwr";

const STATUS_TEXT: Record<AcwrStatus, string> = {
  low: "text-amber-600 dark:text-amber-400",
  optimal: "text-emerald-600 dark:text-emerald-400",
  high: "text-amber-600 dark:text-amber-400",
  elevated: "text-destructive",
};
const STATUS_LABEL: Record<AcwrStatus, string> = {
  low: "Undertraining",
  optimal: "Optimal",
  high: "Caution",
  elevated: "Elevated risk",
};

/**
 * Forward ACWR what-if: how much strain can today absorb before the ratio
 * leaves the sweet spot? Shows the computed budget plus a slider that projects
 * end-of-day ACWR live as you dial in a planned workout. Pure analytics, so all
 * recompute happens client-side.
 */
export function StrainBudget({
  prior,
  targetRatio,
}: {
  prior: PriorLoads;
  targetRatio: number;
}) {
  const budget = strainBudget(prior, targetRatio);
  const restAcwr = projectAcwr(0, prior);

  const initial =
    budget === null
      ? 10
      : Math.min(WHOOP_STRAIN_MAX, Math.max(0, Math.round(budget)));
  const [planned, setPlanned] = useState(initial);

  if (budget === null || restAcwr === null) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough training history yet — needs ~28 days of strain.
      </p>
    );
  }

  const projected = projectAcwr(planned, prior);
  const status = projected === null ? null : acwrStatus(projected);
  const fullHeadroom = budget >= WHOOP_STRAIN_MAX;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-xs">
          Safe strain budget (keeps ACWR ≤ {targetRatio})
        </p>
        <p className="text-3xl font-semibold tabular-nums">
          {fullHeadroom ? "Full headroom" : budget.toFixed(1)}
        </p>
        <p className="text-muted-foreground text-xs">
          {fullHeadroom
            ? `Any workout (≤ ${WHOOP_STRAIN_MAX}) keeps you in the sweet spot.`
            : `A day above ${budget.toFixed(1)} strain pushes you past the sweet spot.`}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Plan a day:</span>
          <span className="tabular-nums">{planned.toFixed(1)} strain</span>
        </div>
        <input
          type="range"
          min={0}
          max={WHOOP_STRAIN_MAX}
          step={0.5}
          value={planned}
          onChange={(e) => setPlanned(Number(e.target.value))}
          className="accent-primary w-full"
          aria-label="Planned day strain"
        />
        <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
          <span>0</span>
          <span>{WHOOP_STRAIN_MAX}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground text-xs">Projected ACWR:</span>
        <span
          className={`text-xl font-semibold tabular-nums ${status ? STATUS_TEXT[status] : ""}`}
        >
          {projected === null ? "—" : projected.toFixed(2)}
        </span>
        {status && (
          <span className={`text-xs font-medium ${STATUS_TEXT[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Rest today → ACWR {restAcwr.toFixed(2)}.
      </p>
    </div>
  );
}
