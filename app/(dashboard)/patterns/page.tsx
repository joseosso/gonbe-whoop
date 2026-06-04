import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dayOfWeekEffect,
  type DayOfWeekResult,
  type WeekdayStat,
} from "@/lib/analytics/day-of-week";
import type { DaySeries } from "@/lib/analytics/types";
import { formatRangeLabel, parseRange } from "@/lib/date-range";
import {
  getRecoverySeries,
  getSleepSeries,
  getStrainSeries,
} from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

/** Display weekdays Mon → Sun (more natural for a training week than Sun-first). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Below this many observations a weekday is flagged low-confidence in the UI. */
const LOW_N = 3;

interface PatternMetric {
  label: string;
  unit: string;
  precision: number;
  result: DayOfWeekResult;
}

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let metrics: PatternMetric[] = [];
  let error: string | null = null;

  try {
    const [recovery, strain, sleep] = await Promise.all([
      getRecoverySeries(range),
      getStrainSeries(range),
      getSleepSeries(range),
    ]);

    const effect = (series: DaySeries) => dayOfWeekEffect(series);
    metrics = [
      {
        label: "Recovery",
        unit: "%",
        precision: 0,
        result: effect(recovery.map((r) => ({ day: r.day, value: r.recoveryScore }))),
      },
      {
        label: "Day Strain",
        unit: "",
        precision: 1,
        result: effect(strain.map((r) => ({ day: r.day, value: r.strain }))),
      },
      {
        label: "Sleep Performance",
        unit: "%",
        precision: 0,
        result: effect(sleep.map((r) => ({ day: r.day, value: r.performancePct }))),
      },
    ];
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Day-of-week patterns
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Each weekday vs your overall mean · {formatRangeLabel(range)}.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {metrics.map((m) => (
            <WeekdayCard key={m.label} metric={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekdayCard({ metric }: { metric: PatternMetric }) {
  const { label, unit, precision, result } = metric;
  const rows = DISPLAY_ORDER.map((i) => result.byWeekday[i]);
  // Scale the diverging bars by the largest swing in either direction.
  const maxAbs = Math.max(
    1e-9,
    ...rows.map((r) => (r.delta === null ? 0 : Math.abs(r.delta))),
  );

  const fmt = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(precision)}${unit}`;
  const fmtDelta = (v: number | null) =>
    v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(precision)}${unit}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {result.overall.mean === null
            ? "No data in range."
            : `Overall mean ${fmt(result.overall.mean)} · n=${result.overall.n}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <WeekdayRow key={r.index} stat={r} maxAbs={maxAbs} fmtDelta={fmtDelta} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function WeekdayRow({
  stat,
  maxAbs,
  fmtDelta,
}: {
  stat: WeekdayStat;
  maxAbs: number;
  fmtDelta: (v: number | null) => string;
}) {
  const lowConfidence = stat.n > 0 && stat.n < LOW_N;
  const delta = stat.delta ?? 0;
  // Half the track per side; bar grows from the centre line outwards.
  const widthPct = (Math.abs(delta) / maxAbs) * 50;
  const positive = delta >= 0;

  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground w-9 shrink-0 font-medium tabular-nums">
        {stat.weekday}
      </span>
      <div className="relative h-4 flex-1">
        {/* Centre line. */}
        <div className="bg-border absolute inset-y-0 left-1/2 w-px" />
        {stat.delta !== null && (
          <div
            className="bg-chart-1 absolute inset-y-0.5 rounded-sm opacity-80"
            style={
              positive
                ? { left: "50%", width: `${widthPct}%` }
                : { right: "50%", width: `${widthPct}%` }
            }
          />
        )}
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums">
        {fmtDelta(stat.delta)}
      </span>
      <span
        className={`w-12 shrink-0 text-right text-xs tabular-nums ${
          lowConfidence ? "text-amber-500" : "text-muted-foreground"
        }`}
        title={lowConfidence ? "Low confidence (small sample)" : undefined}
      >
        n={stat.n}
      </span>
    </li>
  );
}
