import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { MonthlyBars, type MonthBar } from "@/components/charts/monthly-bars";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  comparePeriods,
  type MonthComparison,
} from "@/lib/analytics/periods";
import type { DaySeries } from "@/lib/analytics/types";
import {
  getRecoveryDays,
  getSleepPerformanceDays,
  getStrainDays,
} from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

/** How many trailing months of grouped bars to show. */
const MONTHS_SHOWN = 13;

interface CompareMetric {
  label: string;
  unit: string;
  precision: number;
  months: MonthComparison[];
}

export default async function ComparePage() {
  let metrics: CompareMetric[] = [];
  let error: string | null = null;

  try {
    const [recovery, strain, sleep] = await Promise.all([
      getRecoveryDays(),
      getStrainDays(),
      getSleepPerformanceDays(),
    ]);

    const build = (series: DaySeries) => comparePeriods(series);
    metrics = [
      { label: "Recovery", unit: "%", precision: 0, months: build(recovery) },
      { label: "Day Strain", unit: "", precision: 1, months: build(strain) },
      {
        label: "Sleep Performance",
        unit: "%",
        precision: 0,
        months: build(sleep),
      },
    ];
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Month & year comparisons
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Monthly means across your full history — vs the prior month and the
          same month last year.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {metrics.map((m) => (
            <CompareCard key={m.label} metric={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompareCard({ metric }: { metric: CompareMetric }) {
  const { label, unit, precision, months } = metric;
  const latest = months.at(-1) ?? null;
  const shown = months.slice(-MONTHS_SHOWN);
  const bars: MonthBar[] = shown.map((m) => ({
    month: m.month,
    current: m.mean,
    lastYear: m.prevYear?.mean ?? null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {latest
            ? `Latest: ${format(parseISO(`${latest.month}-01`), "MMMM yyyy")}`
            : "No data yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest && (
          <div className="flex flex-wrap gap-6">
            <Stat label="This month" value={latest.mean} unit={unit} precision={precision} />
            <DeltaStat
              label="vs last month"
              delta={latest.momDelta}
              unit={unit}
              precision={precision}
            />
            <DeltaStat
              label="vs same month last year"
              delta={latest.yoyDelta}
              unit={unit}
              precision={precision}
            />
          </div>
        )}
        <MonthlyBars data={bars} unit={unit} precision={precision} />
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
  precision,
}: {
  label: string;
  value: number | null;
  unit: string;
  precision: number;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {value === null ? "—" : `${value.toFixed(precision)}${unit}`}
      </p>
    </div>
  );
}

function DeltaStat({
  label,
  delta,
  unit,
  precision,
}: {
  label: string;
  delta: number | null;
  unit: string;
  precision: number;
}) {
  const Icon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const sign = delta !== null && delta > 0 ? "+" : "";

  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="flex items-center gap-1 text-xl font-semibold tabular-nums">
        <Icon className="text-muted-foreground size-4" />
        {delta === null
          ? "—"
          : `${sign}${delta.toFixed(precision)}${unit}`}
      </p>
    </div>
  );
}
