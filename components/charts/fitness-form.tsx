"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { FormPoint } from "@/lib/analytics/fitness-form";
import type { EventRow } from "@/lib/analytics/types";
import { eventReferences } from "./event-overlay";
import { longDay, shortDay, tooltipStyle } from "./format";

export interface FitnessFormChartProps {
  data: FormPoint[];
  /** Life events to overlay, clamped to the chart's day range. */
  events?: EventRow[];
}

const SERIES_LABEL: Record<string, string> = {
  fitness: "Fitness (42d)",
  fatigue: "Fatigue (7d)",
  form: "Form",
};

const fmt = (v: number) => v.toFixed(1);

/**
 * Fitness / Fatigue / Form lines (Plan §5.2). Fitness (slow EWMA of strain) and
 * Fatigue (fast EWMA) share the strain axis; Form (Fitness − Fatigue) rides the
 * same scale with a zero reference — above the line is fresh, below is fatigued.
 */
export function FitnessFormChart({ data, events }: FitnessFormChartProps) {
  const hasData = data.some((d) => d.form !== null);
  if (!hasData) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No strain data in range.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
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
          tickFormatter={(v: number) => v.toFixed(0)}
        />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={longDay}
          formatter={(value, name) =>
            value == null
              ? null
              : [fmt(Number(value)), SERIES_LABEL[String(name)] ?? String(name)]
          }
          contentStyle={tooltipStyle}
        />
        <Legend
          formatter={(name) => SERIES_LABEL[String(name)] ?? String(name)}
          iconType="plainline"
          wrapperStyle={{ fontSize: "0.75rem" }}
        />
        {/* Form zero line: above = fresh, below = fatigued. */}
        <ReferenceLine y={0} className="stroke-muted-foreground/40" strokeDasharray="3 3" />
        <Line
          dataKey="fitness"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="fatigue"
          stroke="var(--chart-5)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="form"
          stroke="var(--chart-4)"
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
