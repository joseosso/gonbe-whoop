import { AcwrGauge } from "@/components/charts/acwr-gauge";
import { HrZoneBar, type ZonePoint } from "@/components/charts/hr-zone-bar";
import { StrainRecoveryScatter } from "@/components/charts/strain-recovery-scatter";
import { TrendChart } from "@/components/charts/trend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { acwrSeries, currentAcwr, type AcwrPoint } from "@/lib/analytics/acwr";
import { densify, eachDay } from "@/lib/analytics/dates";
import { summarizeMetric } from "@/lib/analytics/overview";
import {
  flagStrainRecovery,
  type StrainRecoveryPoint,
} from "@/lib/analytics/strain-balance";
import { buildTrend, type TrendPoint } from "@/lib/analytics/trend";
import type { EventRow } from "@/lib/analytics/types";
import {
  clampEventsToRange,
  formatRangeLabel,
  parseRange,
} from "@/lib/date-range";
import {
  getEvents,
  getRecoverySeries,
  getStrainSeries,
  getWorkouts,
} from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

const MS_PER_MIN = 60_000;

export default async function StrainPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let strainTrend: TrendPoint[] = [];
  let scatter: StrainRecoveryPoint[] = [];
  let zones: ZonePoint[] = [];
  let flaggedCount = 0;
  let acwr: AcwrPoint | null = null;
  let hrvZ: number | null = null;
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    const [strain, recovery, workouts, eventRows] = await Promise.all([
      getStrainSeries(range),
      getRecoverySeries(range),
      getWorkouts(range),
      getEvents(range),
    ]);
    events = clampEventsToRange(eventRows, range);

    strainTrend = buildTrend(
      strain.map((s) => ({ day: s.day, value: s.strain })),
      range,
    );

    // ACWR (overtraining watch): trailing 7d vs 28d mean strain over a
    // densified series so the windows are calendar-aligned. The latest point
    // has a full chronic window whenever the range spans ≥ 28 days.
    acwr = currentAcwr(
      acwrSeries(
        densify(
          strain.map((s) => ({ day: s.day, value: s.strain })),
          range,
        ),
      ),
    );
    // HRV deviation from its own 30-day baseline, as a supporting signal.
    hrvZ = summarizeMetric(
      densify(
        recovery.map((r) => ({ day: r.day, value: r.hrvRmssdMilli })),
        range,
      ),
    ).z;

    // Same-day strain vs recovery, only where both exist.
    const recoveryByDay = new Map(
      recovery.map((r) => [r.day, r.recoveryScore]),
    );
    scatter = flagStrainRecovery(
      strain.flatMap((s) => {
        const rec = recoveryByDay.get(s.day);
        return s.strain !== null && rec != null
          ? [{ day: s.day, strain: s.strain, recovery: rec }]
          : [];
      }),
    );
    flaggedCount = scatter.filter((p) => p.flagged).length;

    // Per-day HR-zone minutes, summed across that day's workouts.
    const zoneByDay = new Map<string, number[]>();
    for (const w of workouts) {
      const acc = zoneByDay.get(w.day) ?? [0, 0, 0, 0, 0, 0];
      w.zoneMilli.forEach((z, i) => (acc[i] += (z ?? 0) / MS_PER_MIN));
      zoneByDay.set(w.day, acc);
    }
    zones = eachDay(range).map((day) => {
      const z = zoneByDay.get(day) ?? [0, 0, 0, 0, 0, 0];
      return { day, z0: z[0], z1: z[1], z2: z[2], z3: z[3], z4: z[4], z5: z[5] };
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Strain</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Training load over {formatRangeLabel(range)}.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Overtraining watch</CardTitle>
                <CardDescription>
                  Acute:chronic workload ratio (7d ÷ 28d strain).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AcwrGauge point={acwr} hrvZ={hrvZ} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Daily strain</CardTitle>
                <CardDescription>
                  Cycle strain with EWMA and 30-day baseline band.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={strainTrend} precision={1} events={events} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Strain vs recovery</CardTitle>
                <CardDescription>
                  {flaggedCount > 0
                    ? `${flaggedCount} high-strain day${flaggedCount === 1 ? "" : "s"} on low recovery (shaded).`
                    : "Shaded = high strain on low recovery."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StrainRecoveryScatter data={scatter} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>HR-zone mix</CardTitle>
                <CardDescription>
                  Minutes per heart-rate zone, summed across workouts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HrZoneBar data={zones} events={events} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
