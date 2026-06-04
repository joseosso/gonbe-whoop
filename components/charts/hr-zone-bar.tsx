"use client";

import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EventRow } from "@/lib/analytics/types";
import { eventReferences } from "./event-overlay";

const shortDay = (day: string) => format(parseISO(day), "MMM d");
const longDay = (label: unknown) =>
  typeof label === "string" ? format(parseISO(label), "EEE, MMM d") : "";

/** Per-day HR-zone minutes (zone 0 → 5), summed across that day's workouts. */
export interface ZonePoint {
  day: string;
  z0: number;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

// Cool (easy) → hot (max) across the six WHOOP heart-rate zones.
const ZONES = [
  { key: "z0", label: "Zone 0", color: "var(--chart-2)" },
  { key: "z1", label: "Zone 1", color: "var(--chart-3)" },
  { key: "z2", label: "Zone 2", color: "var(--chart-5)" },
  { key: "z3", label: "Zone 3", color: "var(--chart-4)" },
  { key: "z4", label: "Zone 4", color: "var(--chart-1)" },
  { key: "z5", label: "Zone 5", color: "var(--destructive)" },
] as const;

const mins = (v: number) => `${Math.round(v)} min`;

/** Stacked HR-zone time per day. */
export function HrZoneBar({
  data,
  events,
}: {
  data: ZonePoint[];
  events?: EventRow[];
}) {
  const hasData = data.some(
    (d) => d.z0 + d.z1 + d.z2 + d.z3 + d.z4 + d.z5 > 0,
  );
  if (!hasData) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No workouts in range.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          tickFormatter={(v: number) => `${v}m`}
        />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={longDay}
          formatter={(value, name) => [
            mins(Number(value)),
            ZONES.find((z) => z.key === name)?.label ?? String(name),
          ]}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.75rem",
          }}
        />
        {ZONES.map((z) => (
          <Bar
            key={z.key}
            dataKey={z.key}
            name={z.key}
            stackId="zones"
            fill={z.color}
            isAnimationActive={false}
          />
        ))}
        {eventReferences(events)}
      </BarChart>
    </ResponsiveContainer>
  );
}
