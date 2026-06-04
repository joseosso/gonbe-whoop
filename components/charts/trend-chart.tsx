"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/lib/analytics/trend";
import type { EventRow } from "@/lib/analytics/types";
import { eventReferences } from "./event-overlay";

export interface TrendChartProps {
  data: TrendPoint[];
  /** Appended to values in the axis/tooltip, e.g. `"ms"`, `"bpm"`. */
  unit?: string;
  precision?: number;
  /** Life events to overlay, clamped to the chart's day range. */
  events?: EventRow[];
}

const shortDay = (day: string) => format(parseISO(day), "MMM d");

/**
 * Raw series with an EWMA overlay and a shaded trailing baseline ± SD band
 * (SPEC §5). Parameterized by metric — used for HRV, RHR, and other trends.
 */
export function TrendChart({
  data,
  unit = "",
  precision = 0,
  events,
}: TrendChartProps) {
  const hasData = data.some((d) => d.raw !== null);
  if (!hasData) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No data in range.
      </p>
    );
  }

  const fmt = (v: number) =>
    `${v.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    })}${unit}`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} className="stroke-muted" />
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
          tickLine={false}
          axisLine={false}
          className="text-xs"
          tickFormatter={(v: number) => v.toLocaleString()}
        />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={(label) =>
            typeof label === "string"
              ? format(parseISO(label), "EEE, MMM d")
              : ""
          }
          formatter={(value, name) => {
            if (Array.isArray(value)) {
              return [
                `${fmt(Number(value[0]))} – ${fmt(Number(value[1]))}`,
                "Baseline ±1 SD",
              ];
            }
            return [fmt(Number(value)), name === "ewma" ? "EWMA" : "Raw"];
          }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.75rem",
          }}
        />
        {/* Baseline ± SD band: a range area ([low, high] per point). */}
        <Area
          dataKey="band"
          stroke="none"
          fill="var(--chart-1)"
          fillOpacity={0.15}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Line
          dataKey="raw"
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeOpacity={0.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="ewma"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        {eventReferences(events)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
