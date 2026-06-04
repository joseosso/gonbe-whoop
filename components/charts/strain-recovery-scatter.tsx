"use client";

import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  HIGH_STRAIN,
  LOW_RECOVERY,
  type StrainRecoveryPoint,
} from "@/lib/analytics/strain-balance";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: "0.75rem",
} as const;

/**
 * Same-day strain vs. recovery. The shaded quadrant (high strain, low recovery)
 * is the one to watch; days landing in it are drawn in the destructive color.
 */
export function StrainRecoveryScatter({
  data,
}: {
  data: StrainRecoveryPoint[];
}) {
  if (!data.length) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No data in range.
      </p>
    );
  }

  const ok = data.filter((d) => !d.flagged);
  const flagged = data.filter((d) => d.flagged);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
        <CartesianGrid className="stroke-muted" />
        <XAxis
          type="number"
          dataKey="strain"
          name="Strain"
          domain={[0, 21]}
          tickLine={false}
          axisLine={false}
          className="text-xs"
          label={{ value: "Strain", position: "insideBottom", offset: -8 }}
        />
        <YAxis
          type="number"
          dataKey="recovery"
          name="Recovery"
          domain={[0, 100]}
          width={40}
          tickLine={false}
          axisLine={false}
          className="text-xs"
          label={{ value: "Recovery", angle: -90, position: "insideLeft" }}
        />
        <ReferenceArea
          x1={HIGH_STRAIN}
          x2={21}
          y1={0}
          y2={LOW_RECOVERY}
          fill="var(--destructive)"
          fillOpacity={0.1}
        />
        <Tooltip
          isAnimationActive={false}
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={tooltipStyle}
        />
        <Scatter
          name="Days"
          data={ok}
          fill="var(--chart-1)"
          fillOpacity={0.7}
        />
        <Scatter name="Watch" data={flagged} fill="var(--destructive)" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
