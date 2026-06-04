"use client";

import {
  ACWR_BANDS,
  type AcwrPoint,
  type AcwrStatus,
} from "@/lib/analytics/acwr";

// R/A/G colours for the bands and status.
const AMBER = "rgb(245 158 11)";
const GREEN = "rgb(16 185 129)";
const RED = "var(--destructive)";

/** Status → label + text colour, surfaced in the gauge centre. */
const STATUS_META: Record<AcwrStatus, { label: string; text: string }> = {
  low: { label: "Undertraining", text: "text-amber-600 dark:text-amber-400" },
  optimal: { label: "Optimal", text: "text-emerald-600 dark:text-emerald-400" },
  high: { label: "Caution", text: "text-amber-600 dark:text-amber-400" },
  elevated: { label: "Elevated risk", text: "text-destructive" },
};

// The gauge spans ACWR 0 → MAX across a top semicircle (180° → 0°).
const MAX = 2;
const CX = 110;
const CY = 110;
const R = 92;

const bands: { from: number; to: number; color: string }[] = [
  { from: 0, to: ACWR_BANDS.lowMax, color: AMBER },
  { from: ACWR_BANDS.lowMax, to: ACWR_BANDS.optimalMax, color: GREEN },
  { from: ACWR_BANDS.optimalMax, to: ACWR_BANDS.highMax, color: AMBER },
  { from: ACWR_BANDS.highMax, to: MAX, color: RED },
];

const clamp = (v: number) => Math.max(0, Math.min(MAX, v));
/** ACWR value → angle in degrees (0 → 180°, MAX → 0°). */
const angleOf = (value: number) => 180 - (clamp(value) / MAX) * 180;

function polar(deg: number, r = R): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)];
}

/** Sampled arc path (robust vs. SVG arc-flag pitfalls) across a value range. */
function arcPath(from: number, to: number): string {
  const a1 = angleOf(from);
  const a2 = angleOf(to);
  const steps = Math.max(2, Math.round(Math.abs(a1 - a2) / 3));
  const pts: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const deg = a1 + ((a2 - a1) * s) / steps;
    const [x, y] = polar(deg);
    pts.push(`${s === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Acute:Chronic Workload Ratio gauge. The coloured arc shows the R/A/G bands;
 * the needle points at the current ratio. HRV deviation from baseline is shown
 * as a supporting caption, since low HRV alongside a high ACWR strengthens an
 * overtraining read.
 */
export function AcwrGauge({
  point,
  hrvZ,
}: {
  point: AcwrPoint | null;
  hrvZ: number | null;
}) {
  if (!point || point.ratio === null) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough training history yet — ACWR needs ~28 days of strain.
      </p>
    );
  }

  const { ratio, status, chronicN } = point;
  const meta = STATUS_META[status!];
  const [nx, ny] = polar(angleOf(ratio), R - 14);
  const thin = chronicN < 21;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 220 130"
        className="w-full max-w-xs"
        role="img"
        aria-label={`ACWR ${ratio.toFixed(2)}, ${meta.label}`}
      >
        {bands.map((b) => (
          <path
            key={b.from}
            d={arcPath(b.from, b.to)}
            fill="none"
            stroke={b.color}
            strokeWidth={16}
            strokeLinecap="butt"
            opacity={0.85}
          />
        ))}
        {/* Needle. */}
        <line
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
          stroke="var(--foreground)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={4} fill="var(--foreground)" />
        <text
          x={CX}
          y={CY - 34}
          textAnchor="middle"
          className="fill-foreground text-2xl font-semibold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ratio.toFixed(2)}
        </text>
      </svg>

      <p className={`text-sm font-medium ${meta.text}`}>{meta.label}</p>

      {hrvZ !== null && (
        <p className="text-muted-foreground text-xs">
          HRV vs 30-day baseline: {hrvZ >= 0 ? "+" : ""}
          {hrvZ.toFixed(1)} SD
        </p>
      )}
      {thin && (
        <p className="text-amber-600 dark:text-amber-400 text-xs">
          Based on {chronicN} days — interpret with caution until ~28.
        </p>
      )}
    </div>
  );
}
