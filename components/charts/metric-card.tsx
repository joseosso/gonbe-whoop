import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

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

/** Semantic accent for a metric — drives the sparkline color via currentColor. */
export type Accent = "emerald" | "sky" | "violet" | "amber" | "neutral";

/**
 * Whether a higher value is good. `up`/`down` color the badge good/bad;
 * `neutral` (e.g. strain — context-dependent) stays slate.
 */
export type Direction = "up" | "down" | "neutral";

export interface MetricCardProps {
  label: string;
  /** Appended to the value, e.g. `"%"`. */
  unit?: string;
  /** Decimal places for the value and baseline mean. */
  precision?: number;
  /** Dense series for the sparkline (one point per day, nulls = gaps). */
  series: DaySeries;
  summary: MetricSummary;
  /** Sparkline accent color. Defaults to the theme primary. */
  accent?: Accent;
  /** Which direction is "good", for badge coloring. Defaults to neutral. */
  direction?: Direction;
}

const ACCENT_TEXT: Record<Accent, string> = {
  emerald: "text-emerald-500",
  sky: "text-sky-500",
  violet: "text-violet-500",
  amber: "text-amber-500",
  neutral: "text-primary",
};

type Tone = "good" | "bad" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  bad: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  neutral: "bg-muted text-muted-foreground",
};

const fmt = (n: number, precision: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

/** Map a change direction + sign to a good/bad/neutral tone. */
function toneOf(z: number | null, direction: Direction): Tone {
  if (z === null || direction === "neutral") return "neutral";
  const good = direction === "up" ? z >= 0 : z <= 0;
  return good ? "good" : "bad";
}

export function MetricCard({
  label,
  unit = "",
  precision = 0,
  series,
  summary,
  accent = "neutral",
  direction = "neutral",
}: MetricCardProps) {
  const { latest, baseline, z, meaningful } = summary;
  const tone = toneOf(z, direction);
  const delta =
    latest && baseline.mean !== null ? latest.value - baseline.mean : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <ZBadge z={z} meaningful={meaningful} tone={tone} />
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
                <span className="text-muted-foreground text-xs tabular-nums">
                  {delta !== null && (
                    <span
                      className={cn(
                        "font-medium",
                        tone === "good" && "text-emerald-600 dark:text-emerald-400",
                        tone === "bad" && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {delta >= 0 ? "+" : "−"}
                      {fmt(Math.abs(delta), precision)}
                      {unit}{" "}
                    </span>
                  )}
                  vs {fmt(baseline.mean, precision)}
                  {unit} avg
                </span>
              )}
            </div>
            <Sparkline
              series={series}
              baseline={baseline}
              accent={accent}
              meaningful={meaningful}
              label={label}
            />
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
  tone,
}: {
  z: number | null;
  meaningful: boolean;
  tone: Tone;
}) {
  if (z === null) return null;
  const Arrow = z > 0 ? ArrowUp : z < 0 ? ArrowDown : ArrowRight;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 tabular-nums",
        TONE_CLASS[tone],
        // Meaningful (|z| ≥ 1.5) gets a ring so it's distinguishable from
        // routine variation without overloading the good/bad color.
        meaningful && "font-semibold ring-1 ring-current/30",
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
/** Cap sparkline points so long ranges stay legible (mean-bucketed). */
const MAX_POINTS = 120;

/**
 * Downsample a day series to at most `max` buckets by mean, preserving gaps
 * (a bucket with no real values stays null). Keeps long ranges from rendering
 * as an unreadable scribble while staying honest to the trend.
 */
function resample(series: DaySeries, max: number): DaySeries {
  if (series.length <= max) return series;
  const size = series.length / max;
  const out: DaySeries = [];
  for (let b = 0; b < max; b++) {
    const start = Math.floor(b * size);
    const end = Math.floor((b + 1) * size);
    const slice = series
      .slice(start, end)
      .map((p) => p.value)
      .filter((v): v is number => v !== null);
    out.push({
      day: series[start].day,
      value: slice.length
        ? slice.reduce((a, c) => a + c, 0) / slice.length
        : null,
    });
  }
  return out;
}

/**
 * Inline sparkline: accent-colored line + gradient area fill, a dashed baseline
 * mean line with a ±SD band, and a last-point dot (amber when the latest value
 * breaches the band). Pure SVG, server-renderable.
 */
function Sparkline({
  series: raw,
  baseline,
  accent,
  meaningful,
  label,
}: {
  series: DaySeries;
  baseline: MetricSummary["baseline"];
  accent: Accent;
  meaningful: boolean;
  label: string;
}) {
  const series = resample(raw, MAX_POINTS);
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  if (values.length < 2) return <div className="h-10" />;

  const sd = baseline.sd ?? 0;
  const mean = baseline.mean;
  const bandTop = mean === null ? null : mean + sd;
  const bandBottom = mean === null ? null : mean - sd;

  const lo = Math.min(...values, bandBottom ?? Infinity);
  const hi = Math.max(...values, bandTop ?? -Infinity);
  const span = hi - lo || 1;

  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);

  // Split into continuous (non-null) segments so gaps break both line and fill.
  const segments: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  series.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, v: p.value });
    }
  });
  if (current.length) segments.push(current);

  const pts = (seg: { i: number; v: number }[]) =>
    seg.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  const lastIdx = series.findLastIndex((p) => p.value !== null);
  const last = series[lastIdx];
  const gradId = `spark-${accent}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-10 w-full overflow-visible", ACCENT_TEXT[accent])}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} recent trend`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* ±SD baseline band (neutral, doesn't compete with the accent line). */}
      {bandTop !== null && bandBottom !== null && (
        <rect
          x={0}
          y={y(bandTop)}
          width={W}
          height={Math.max(1, y(bandBottom) - y(bandTop))}
          className="fill-muted-foreground/15"
        />
      )}
      {/* Baseline mean: anchors "where is normal". */}
      {mean !== null && (
        <line
          x1={0}
          x2={W}
          y1={y(mean)}
          y2={y(mean)}
          className="stroke-muted-foreground/40"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Gradient area fill under each continuous segment. */}
      {segments.map((seg, i) => (
        <polygon
          key={`fill-${i}`}
          points={`${x(seg[0].i).toFixed(1)},${(H - PAD).toFixed(1)} ${pts(
            seg,
          )} ${x(seg[seg.length - 1].i).toFixed(1)},${(H - PAD).toFixed(1)}`}
          fill={`url(#${gradId})`}
          stroke="none"
        />
      ))}
      {/* Accent line. */}
      {segments.map((seg, i) => (
        <polyline
          key={`line-${i}`}
          points={pts(seg)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Last point: amber + ring when the latest value breaches the band. */}
      {last?.value != null && (
        <circle
          cx={x(lastIdx)}
          cy={y(last.value)}
          r={meaningful ? 3 : 2.5}
          className={meaningful ? "fill-amber-500" : "fill-current"}
        />
      )}
    </svg>
  );
}
