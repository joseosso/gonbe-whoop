import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { MetricSummary } from "@/lib/analytics/overview";
import type { DaySeries } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  /** Appended to the value, e.g. `"%"`. */
  unit?: string;
  /** Decimal places for the value and baseline mean. */
  precision?: number;
  /** Dense series for the sparkline (one point per day, nulls = gaps). */
  series: DaySeries;
  summary: MetricSummary;
}

const fmt = (n: number, precision: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

export function MetricCard({
  label,
  unit = "",
  precision = 0,
  series,
  summary,
}: MetricCardProps) {
  const { latest, baseline, z, meaningful } = summary;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <ZBadge z={z} meaningful={meaningful} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {latest ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums">
                {fmt(latest.value, precision)}
                <span className="text-muted-foreground text-base">{unit}</span>
              </span>
              {baseline.mean !== null && (
                <span className="text-muted-foreground text-xs">
                  vs {fmt(baseline.mean, precision)}
                  {unit} avg
                </span>
              )}
            </div>
            <Sparkline series={series} baseline={baseline} />
          </>
        ) : (
          <p className="text-muted-foreground py-4 text-sm">
            No data in range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ZBadge({
  z,
  meaningful,
}: {
  z: number | null;
  meaningful: boolean;
}) {
  if (z === null) return null;
  const Arrow = z >= 0 ? ArrowUp : ArrowDown;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 tabular-nums",
        meaningful
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      )}
    >
      <Arrow className="size-3" />z {z >= 0 ? "+" : ""}
      {z.toFixed(1)}
    </Badge>
  );
}

const W = 160;
const H = 40;
const PAD = 3;

/** Inline sparkline with a shaded baseline (mean ± SD) band. Pure SVG. */
function Sparkline({
  series,
  baseline,
}: {
  series: DaySeries;
  baseline: MetricSummary["baseline"];
}) {
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  if (values.length < 2) return <div className="h-10" />;

  const sd = baseline.sd ?? 0;
  const bandTop = baseline.mean === null ? null : baseline.mean + sd;
  const bandBottom = baseline.mean === null ? null : baseline.mean - sd;

  const lo = Math.min(...values, bandBottom ?? Infinity);
  const hi = Math.max(...values, bandTop ?? -Infinity);
  const span = hi - lo || 1;

  const x = (i: number) =>
    PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);

  // Split into continuous (non-null) segments so gaps break the line.
  const segments: string[] = [];
  let current: string[] = [];
  series.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  const lastIdx = series.findLastIndex((p) => p.value !== null);
  const last = series[lastIdx];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-10 w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      aria-label="Recent trend"
    >
      {bandTop !== null && bandBottom !== null && (
        <rect
          x={0}
          y={y(bandTop)}
          width={W}
          height={Math.max(1, y(bandBottom) - y(bandTop))}
          className="fill-muted-foreground/15"
        />
      )}
      {segments.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {last?.value !== null && last !== undefined && (
        <circle
          cx={x(lastIdx)}
          cy={y(last.value)}
          r={2.5}
          className="fill-primary"
        />
      )}
    </svg>
  );
}
