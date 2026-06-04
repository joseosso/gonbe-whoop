"use client";

import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { tooltipStyle } from "./format";

/** One displayed month: its mean vs the same month one year earlier (YoY). */
export interface MonthBar {
  month: string; // YYYY-MM
  current: number | null;
  lastYear: number | null;
}

/** `2024-06` → `Jun '24` for a compact month axis tick. */
const monthLabel = (month: string) => format(parseISO(`${month}-01`), "MMM ''yy");

/**
 * Grouped monthly bars: each month shows the current value beside the same
 * month a year earlier, so the sequence reads as month-over-month and each
 * pair reads as year-over-year (SPEC §5).
 */
export function MonthlyBars({
  data,
  unit = "",
  precision = 0,
}: {
  data: MonthBar[];
  unit?: string;
  precision?: number;
}) {
  if (!data.some((d) => d.current !== null || d.lastYear !== null)) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough history yet.
      </p>
    );
  }

  const fmt = (value: number) => `${value.toFixed(precision)}${unit}`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} className="stroke-muted" />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          minTickGap={8}
          tickLine={false}
          axisLine={false}
          className="text-xs"
        />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          className="text-xs"
        />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={(label) =>
            typeof label === "string" ? monthLabel(label) : ""
          }
          formatter={(value, name) => [
            value === null ? "—" : fmt(Number(value)),
            name === "current" ? "This year" : "Last year",
          ]}
          contentStyle={tooltipStyle}
        />
        <Legend
          formatter={(name) => (name === "current" ? "This year" : "Last year")}
          wrapperStyle={{ fontSize: "0.75rem" }}
        />
        <Bar dataKey="current" fill="var(--chart-1)" isAnimationActive={false} />
        <Bar
          dataKey="lastYear"
          fill="var(--chart-2)"
          fillOpacity={0.5}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
