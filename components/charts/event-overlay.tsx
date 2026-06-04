"use client";

import { ReferenceArea, ReferenceLine } from "recharts";

import type { EventRow } from "@/lib/analytics/types";

const labelStyle = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
} as const;

/**
 * Recharts reference elements for life events, to drop into any day-axis chart:
 * a dashed vertical line for single-day events, a faint band for multi-day
 * spans. Event days must fall within the chart's day domain — clamp first with
 * `clampEventsToRange`. Returns an array, so use as `{eventReferences(events)}`
 * directly inside the chart.
 */
export function eventReferences(events: EventRow[] = []) {
  return events.map((e) =>
    e.endDay && e.endDay !== e.startDay ? (
      <ReferenceArea
        key={e.id}
        x1={e.startDay}
        x2={e.endDay}
        fill="var(--foreground)"
        fillOpacity={0.06}
        label={{ value: e.label, position: "insideTopLeft", ...labelStyle }}
      />
    ) : (
      <ReferenceLine
        key={e.id}
        x={e.startDay}
        stroke="var(--muted-foreground)"
        strokeDasharray="3 3"
        label={{ value: e.label, position: "top", ...labelStyle }}
      />
    ),
  );
}
