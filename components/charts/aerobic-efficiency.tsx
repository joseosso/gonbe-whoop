"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AerobicEfficiency,
  ConfirmSignal,
} from "@/lib/analytics/aerobic-efficiency";
import { tooltipStyle } from "./format";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Tolerant of Recharts' `unknown` tooltip label; also serves as a tick formatter.
const monthLabel = (m: unknown) => {
  if (typeof m !== "string") return "";
  const [year, mo] = m.split("-");
  return `${MONTHS[Number(mo) - 1]} ’${year.slice(2)}`;
};

const METRIC_LABEL: Record<AerobicEfficiency["metric"], string> = {
  kilojoule: "kJ / bpm",
  strain: "strain / bpm",
};

/**
 * Aerobic-efficiency trend (Plan §5.5). Plots monthly output-per-HR (raw +
 * EWMA) for the dominant comparable sport — a rising line means the same work
 * at a lower heart rate, i.e. an improving aerobic base. A falling resting-HR
 * and rising HRV baseline are shown below as a confirming second signal.
 */
export function AerobicEfficiencyChart({ data }: { data: AerobicEfficiency }) {
  if (data.empty) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough comparable steady efforts yet to track efficiency.
      </p>
    );
  }

  const precision = data.metric === "strain" ? 3 : 1;
  const fmt = (v: number) => v.toFixed(precision);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        {data.sport} · {METRIC_LABEL[data.metric]} · {data.n} steady session
        {data.n === 1 ? "" : "s"}
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={data.months}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} className="stroke-muted" />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            minTickGap={24}
            tickLine={false}
            axisLine={false}
            className="text-xs"
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            className="text-xs"
            domain={["auto", "auto"]}
            tickFormatter={fmt}
          />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={monthLabel}
            formatter={(value, name) => [
              fmt(Number(value)),
              name === "smoothed" ? "Trend" : "Monthly",
            ]}
            contentStyle={tooltipStyle}
          />
          <Line
            dataKey="index"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeOpacity={0.5}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="smoothed"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-muted-foreground">Confirming signals:</span>
        <ConfirmReadout label="RHR" unit="bpm" signal={data.confirm.restingHr} />
        <ConfirmReadout label="HRV" unit="ms" signal={data.confirm.hrv} />
      </div>
    </div>
  );
}

function ConfirmReadout({
  label,
  unit,
  signal,
}: {
  label: string;
  unit: string;
  signal: ConfirmSignal;
}) {
  if (signal.delta === null) {
    return (
      <span className="text-muted-foreground tabular-nums">{label} —</span>
    );
  }
  const arrow = signal.delta > 0 ? "↑" : signal.delta < 0 ? "↓" : "→";
  const color = signal.improving
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-muted-foreground";
  return (
    <span className={`tabular-nums ${color}`}>
      {label} {arrow} {Math.abs(signal.delta).toFixed(0)} {unit}
    </span>
  );
}
