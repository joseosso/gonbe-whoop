import {
  type IntensityBand,
  POLARIZED_TARGET,
  type ZoneDistribution,
} from "@/lib/analytics/zone-distribution";

const BAND_META: Record<
  IntensityBand,
  { label: string; sub: string; bar: string; text: string }
> = {
  low: {
    label: "Low",
    sub: "easy aerobic · Z0–3",
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  gray: {
    label: "Gray",
    sub: "threshold · Z4",
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High",
    sub: "anaerobic · Z5",
    bar: "bg-destructive",
    text: "text-destructive",
  },
};

const BAND_ORDER: IntensityBand[] = ["low", "gray", "high"];

const pct = (share: number) => `${Math.round(share * 100)}%`;

const formatHours = (minutes: number) => {
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
};

/**
 * Polarized zone-distribution (Plan §5.4). Shows the actual low/gray/high split
 * of training time against the Seiler 80/20 target, with the total time analyzed
 * and a flag when too much volume lands in the threshold "gray zone".
 */
export function ZoneDistributionChart({ data }: { data: ZoneDistribution }) {
  if (data.empty) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No workouts in range.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {formatHours(data.totalMinutes)} of zone time analyzed
        </p>
        {data.grayZoneFlagged ? (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Too much gray zone ({pct(data.bandShare.gray)})
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">Polarized split</p>
        )}
      </div>

      {/* Actual split — one segmented bar across the three bands. */}
      <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full">
        {BAND_ORDER.map((band) =>
          data.bandShare[band] > 0 ? (
            <div
              key={band}
              className={BAND_META[band].bar}
              style={{ width: `${data.bandShare[band] * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {BAND_ORDER.map((band) => {
          const meta = BAND_META[band];
          const actual = data.bandShare[band];
          const target = POLARIZED_TARGET[band];
          return (
            <li
              key={band}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm ${meta.bar}`} />
                <span className="font-medium">{meta.label}</span>
                <span className="text-muted-foreground text-xs">
                  {meta.sub}
                </span>
              </span>
              <span className="tabular-nums">
                <span className={`font-medium ${meta.text}`}>{pct(actual)}</span>
                <span className="text-muted-foreground text-xs">
                  {" "}
                  / {pct(target)} target
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
