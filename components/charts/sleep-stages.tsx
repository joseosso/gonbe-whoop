"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EventRow } from "@/lib/analytics/types";
import { eventReferences } from "./event-overlay";
import { longDay, shortDay, tooltipStyle } from "./format";

/** One night's sleep stages, in hours (null on nights with no sleep). */
export interface StagePoint {
  day: string;
  light: number | null;
  sws: number | null;
  rem: number | null;
  awake: number | null;
}

const STAGES = [
  { key: "rem", label: "REM", color: "var(--chart-4)" },
  { key: "sws", label: "Deep (SWS)", color: "var(--chart-1)" },
  { key: "light", label: "Light", color: "var(--chart-2)" },
  { key: "awake", label: "Awake", color: "var(--muted-foreground)" },
] as const;

const hrs = (v: number) => `${v.toFixed(1)} h`;

/** Stacked-area sleep stages over the range. */
export function SleepStagesChart({
  data,
  events,
}: {
  data: StagePoint[];
  events?: EventRow[];
}) {
  if (
    !data.some(
      (d) =>
        d.light !== null ||
        d.sws !== null ||
        d.rem !== null ||
        d.awake !== null,
    )
  ) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No sleep in range.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          tickFormatter={(v: number) => `${v}h`}
        />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={longDay}
          formatter={(value, name) => [
            hrs(Number(value)),
            STAGES.find((s) => s.key === name)?.label ?? String(name),
          ]}
          contentStyle={tooltipStyle}
        />
        {STAGES.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.key}
            stackId="stages"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.55}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
        {eventReferences(events)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Trailing-14-day sleep debt in hours (positive = under-slept). */
export interface DebtPoint {
  day: string;
  hours: number | null;
}

export function SleepDebtChart({
  data,
  events,
}: {
  data: DebtPoint[];
  events?: EventRow[];
}) {
  if (!data.some((d) => d.hours !== null)) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No sleep in range.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          tickFormatter={(v: number) => `${v}h`}
        />
        <ReferenceLine y={0} className="stroke-muted-foreground" />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={longDay}
          formatter={(value) => {
            const h = Number(value);
            return [
              `${Math.abs(h).toFixed(1)} h ${h >= 0 ? "debt" : "banked"}`,
              "Trailing 14d",
            ];
          }}
          contentStyle={tooltipStyle}
        />
        <Area
          dataKey="hours"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.2}
          isAnimationActive={false}
          connectNulls
        />
        {eventReferences(events)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
