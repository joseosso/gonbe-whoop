import { ArrowDown, ArrowUp, ShieldCheck } from "lucide-react";

import type { RadarResult, RadarStatus, SignalReading } from "@/lib/analytics/strain-radar";

/** Status → accent colour + copy for the radar centre and caption. */
const STATUS_META: Record<
  RadarStatus,
  { label: string; stroke: string; fill: string; text: string }
> = {
  ok: {
    label: "All clear",
    stroke: "rgb(16 185 129)",
    fill: "rgb(16 185 129 / 0.18)",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  watch: {
    label: "Watch",
    stroke: "rgb(245 158 11)",
    fill: "rgb(245 158 11 / 0.18)",
    text: "text-amber-600 dark:text-amber-400",
  },
  alert: {
    label: "Elevated",
    stroke: "var(--destructive)",
    fill: "rgb(239 68 68 / 0.18)",
    text: "text-destructive",
  },
};

// Geometry: a regular pentagon (one vertex per signal). The viewBox is wide so
// the left/right axis labels ("Respiratory rate", "Resting HR") have room and
// aren't clipped; the pentagon stays centred at CX.
const CX = 175;
const CY = 120;
const R = 76;
// z deviations are mapped onto [0, MAX_Z]; the threshold ring sits at 1.5.
const MAX_Z = 3;
const THRESHOLD_Z = 1.5;

/** Vertex angle (degrees) for signal `i` of `n`, first vertex at the top. */
const angleOf = (i: number, n: number) => -90 + (360 / n) * i;

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Adverse z → radius fraction [0, 1]; calm/favourable signals sit at centre. */
const radiusFrac = (adverseZ: number | null) =>
  adverseZ === null ? 0 : Math.max(0, Math.min(adverseZ, MAX_Z)) / MAX_Z;

const polygon = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/**
 * Illness & strain early-warning radar (Plan §4.2). A spider chart of the five
 * body-stress signals, each plotted by how far it deviates **in the adverse
 * direction** from its own baseline. The amber ring is the `|z| ≥ 1.5` breach
 * threshold; the shaded shape and centre status reflect how many signals cross
 * it. The driving signals are listed below so the read is explainable.
 */
export function StrainRadar({ result }: { result: RadarResult }) {
  const { readings, drivers, breachCount, status } = result;
  const hasData = readings.some((r) => r.value !== null);

  if (!hasData) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough data yet — needs ~30 days of recovery & sleep history.
      </p>
    );
  }

  const meta = STATUS_META[status];
  const n = readings.length;
  const outer = readings.map((_, i) => polar(angleOf(i, n), R));
  const ring = readings.map((_, i) =>
    polar(angleOf(i, n), R * (THRESHOLD_Z / MAX_Z)),
  );
  const shape = readings.map((r, i) =>
    polar(angleOf(i, n), R * radiusFrac(r.adverseZ)),
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 350 220"
        className="w-full max-w-md"
        role="img"
        aria-label={`Early-warning radar: ${meta.label}, ${breachCount} of ${n} signals off baseline`}
      >
        {/* Outer grid + spokes. */}
        <polygon
          points={polygon(outer)}
          fill="none"
          className="stroke-muted-foreground/25"
          strokeWidth={1}
        />
        {outer.map(([x, y], i) => (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            className="stroke-muted-foreground/20"
            strokeWidth={1}
          />
        ))}
        {/* Breach threshold ring (|z| = 1.5). */}
        <polygon
          points={polygon(ring)}
          fill="none"
          stroke="rgb(245 158 11)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.7}
        />
        {/* Fused deviation shape. */}
        <polygon
          points={polygon(shape)}
          fill={meta.fill}
          stroke={meta.stroke}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {shape.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={readings[i].breached ? 3 : 2}
            fill={readings[i].breached ? meta.stroke : "var(--muted-foreground)"}
          />
        ))}
        {/* Axis labels. */}
        {readings.map((r, i) => {
          const [x, y] = polar(angleOf(i, n), R + 16);
          const anchor =
            x < CX - 1 ? "end" : x > CX + 1 ? "start" : "middle";
          return (
            <text
              key={r.key}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {r.label}
            </text>
          );
        })}
      </svg>

      <div className="flex items-center gap-1.5">
        {status === "ok" && <ShieldCheck className={`size-4 ${meta.text}`} />}
        <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
        <span className="text-muted-foreground text-xs">
          · {breachCount}/{n} signals off baseline
        </span>
      </div>

      {drivers.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {drivers.map((d) => (
            <DriverRow key={d.key} reading={d} text={meta.text} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          No signal is more than 1.5 SD from your baseline.
        </p>
      )}
    </div>
  );
}

function DriverRow({
  reading,
  text,
}: {
  reading: SignalReading;
  text: string;
}) {
  // The adverse direction the breach occurred in (skin temp/RHR/resp ↑, HRV/SpO2 ↓).
  const Arrow = reading.adverse === "high" ? ArrowUp : ArrowDown;
  return (
    <li className="flex items-center gap-1.5">
      <Arrow className={`size-3 ${text}`} />
      <span className="text-foreground">{reading.label}</span>
      <span className="text-muted-foreground tabular-nums">
        z {reading.z! >= 0 ? "+" : ""}
        {reading.z!.toFixed(1)}
      </span>
    </li>
  );
}
