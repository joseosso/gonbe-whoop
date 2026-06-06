"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ACWR_BANDS,
  type AcwrPoint,
  type AcwrStatus,
} from "@/lib/analytics/acwr";
import type { EventRow } from "@/lib/analytics/types";
import { eventReferences } from "./event-overlay";
import { longDay, shortDay, tooltipStyle } from "./format";

// R/A/G colours, kept in step with the ACWR gauge so the chart's latest point
// reads the same as the needle.
const AMBER = "rgb(245 158 11)";
const GREEN = "rgb(16 185 129)";
const RED = "var(--destructive)";

/** Status → dot colour + the human label used in zones and the tooltip. */
const STATUS_META: Record<AcwrStatus, { color: string; label: string }> = {
  low: { color: AMBER, label: "Undertraining" },
  optimal: { color: GREEN, label: "Sweet spot" },
  high: { color: AMBER, label: "Caution" },
  elevated: { color: RED, label: "Overreaching" },
};

export interface AcwrTrendChartProps {
  data: AcwrPoint[];
  /** Life events to overlay, clamped to the chart's day range. */
  events?: EventRow[];
}

/** Minimal shape Recharts hands a custom dot renderer. */
interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: AcwrPoint;
}

/** Per-day dot coloured by status; nothing on days without a computable ratio. */
function StatusDot({ cx, cy, index, payload }: DotProps) {
  if (cx == null || cy == null || payload?.status == null) {
    return <g key={index} />;
  }
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={2.5}
      fill={STATUS_META[payload.status].color}
    />
  );
}

/** As a signed percentage vs the chronic load (Apple's "+81%" framing). */
const asPercent = (ratio: number) =>
  `${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%`;

function AcwrTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AcwrPoint }[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p || p.ratio === null || p.status === null) return null;
  const meta = STATUS_META[p.status];
  return (
    <div style={tooltipStyle} className="px-2.5 py-1.5">
      <p className="text-foreground font-medium">{longDay(p.day)}</p>
      <p className="tabular-nums" style={{ color: meta.color }}>
        {p.ratio.toFixed(2)} ({asPercent(p.ratio)}) · {meta.label}
      </p>
      <p className="text-muted-foreground tabular-nums">
        7d {p.acute?.toFixed(1) ?? "–"} vs 28d {p.chronic?.toFixed(1) ?? "–"}
      </p>
      {p.chronicN < 21 && (
        <p className="text-amber-600 dark:text-amber-400">
          Based on {p.chronicN} days — interpret with caution.
        </p>
      )}
    </div>
  );
}

const labelStyle = { fontSize: 10, fill: "var(--muted-foreground)" } as const;

/**
 * Acute:chronic workload ratio over time. The shaded zones are the gauge's R/A/G
 * bands laid flat (undertraining → sweet spot → caution → overreaching), so a
 * glance shows when training drifted out of the sweet spot. The line is the
 * daily ratio with dots coloured by status; 1.0 marks acute = chronic (steady).
 */
export function AcwrTrendChart({ data, events }: AcwrTrendChartProps) {
  const ratios = data
    .map((d) => d.ratio)
    .filter((r): r is number => r !== null);

  if (ratios.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough training history yet — ACWR needs ~28 days of strain.
      </p>
    );
  }

  // Pad the domain around the data but always keep the sweet-spot band in view,
  // so the zones read consistently even on a flat stretch.
  const yMin = Math.max(0, Math.min(0.6, Math.min(...ratios) - 0.1));
  const yMax = Math.max(1.7, Math.max(...ratios) + 0.1);

  const zones: { from: number; to: number; color: string; label: string }[] = [
    { from: yMin, to: ACWR_BANDS.lowMax, color: AMBER, label: "Undertraining" },
    {
      from: ACWR_BANDS.lowMax,
      to: ACWR_BANDS.optimalMax,
      color: GREEN,
      label: "Sweet spot",
    },
    { from: ACWR_BANDS.optimalMax, to: ACWR_BANDS.highMax, color: AMBER, label: "" },
    {
      from: ACWR_BANDS.highMax,
      to: yMax,
      color: RED,
      label: "Overreaching",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} className="stroke-muted" />
        {zones.map((z) => (
          <ReferenceArea
            key={z.from}
            y1={z.from}
            y2={z.to}
            fill={z.color}
            fillOpacity={0.1}
            ifOverflow="hidden"
            label={
              z.label
                ? { value: z.label, position: "insideLeft", ...labelStyle }
                : undefined
            }
          />
        ))}
        {/* Steady state: acute load equals chronic load. */}
        <ReferenceLine
          y={1}
          className="stroke-muted-foreground/40"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          minTickGap={32}
          tickLine={false}
          axisLine={false}
          className="text-xs"
        />
        <YAxis
          width={40}
          domain={[yMin, yMax]}
          tickLine={false}
          axisLine={false}
          className="text-xs"
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip isAnimationActive={false} content={<AcwrTooltip />} />
        <Line
          dataKey="ratio"
          stroke="var(--foreground)"
          strokeWidth={2}
          dot={<StatusDot />}
          isAnimationActive={false}
          connectNulls
        />
        {eventReferences(events)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
