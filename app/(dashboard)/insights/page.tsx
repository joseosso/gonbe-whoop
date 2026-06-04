import { CorrelationMatrix } from "@/components/charts/correlation-matrix";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { acwrSeries } from "@/lib/analytics/acwr";
import { rankDrivers, type DriverSpec } from "@/lib/analytics/correlate";
import { densify, eachDay, localClockMinutes } from "@/lib/analytics/dates";
import { sleepDebt, sleepNights } from "@/lib/analytics/sleep-debt";
import type { DaySeries } from "@/lib/analytics/types";
import { formatRangeLabel, parseRange } from "@/lib/date-range";
import {
  getDayTags,
  getRecoverySeries,
  getSleepSeries,
  getStrainSeries,
} from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

const MS_PER_HOUR = 3_600_000;
/** A tag needs at least this many tagged days in range to be correlatable. */
const MIN_TAG_DAYS = 5;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let drivers: ReturnType<typeof rankDrivers> = [];
  let error: string | null = null;

  try {
    const [recovery, strain, sleep, tags] = await Promise.all([
      getRecoverySeries(range),
      getStrainSeries(range),
      getSleepSeries(range),
      getDayTags(range),
    ]);

    const outcome = densify(
      recovery.map((r) => ({ day: r.day, value: r.recoveryScore })),
      range,
    );

    const strainDense = densify(
      strain.map((s) => ({ day: s.day, value: s.strain })),
      range,
    );
    const debt: DaySeries = sleepDebt(sleepNights(sleep, range)).map((p) => ({
      day: p.day,
      value: p.debtMilli === null ? null : p.debtMilli / MS_PER_HOUR,
    }));
    const acwr: DaySeries = acwrSeries(strainDense).map((p) => ({
      day: p.day,
      value: p.ratio,
    }));
    const sleepByDay = (pick: (s: (typeof sleep)[number]) => number | null) =>
      densify(
        sleep.map((s) => ({ day: s.day, value: pick(s) })),
        range,
      );

    const specs: DriverSpec[] = [
      { key: "strain", label: "Day strain", hint: "harder yesterday", lag: 1, series: strainDense },
      { key: "debt", label: "Sleep debt", hint: "more debt", lag: 1, series: debt },
      { key: "acwr", label: "Training load (ACWR)", hint: "higher load", lag: 1, series: acwr },
      {
        key: "bedtime",
        label: "Bedtime",
        hint: "later",
        lag: 0,
        series: densify(
          sleep.map((s) => ({
            day: s.day,
            value: localClockMinutes(s.startTime, s.tzOffset),
          })),
          range,
        ),
      },
      {
        key: "sleepPerf",
        label: "Sleep performance",
        hint: "% of need met",
        lag: 0,
        series: sleepByDay((s) => s.performancePct),
      },
      {
        key: "sleepDuration",
        label: "Sleep duration",
        hint: "hours asleep",
        lag: 0,
        series: sleepByDay((s) =>
          s.lightMilli === null && s.swsMilli === null && s.remMilli === null
            ? null
            : ((s.lightMilli ?? 0) + (s.swsMilli ?? 0) + (s.remMilli ?? 0)) /
              MS_PER_HOUR,
        ),
      },
    ];

    // Tags as binary day series (1 = tagged), only those seen often enough.
    const tagDaysByName = new Map<string, Set<string>>();
    for (const t of tags) {
      const set = tagDaysByName.get(t.tag) ?? new Set();
      set.add(t.day);
      tagDaysByName.set(t.tag, set);
    }
    const days = eachDay(range);
    for (const [tag, tagged] of tagDaysByName) {
      if (tagged.size < MIN_TAG_DAYS) continue;
      specs.push({
        key: `tag:${tag}`,
        label: `“${tag}” day`,
        hint: "behaviour tag",
        lag: 1,
        series: days.map((day) => ({ day, value: tagged.has(day) ? 1 : 0 })),
      });
    }

    drivers = rankDrivers(outcome, specs);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What actually moves your recovery · {formatRangeLabel(range)}.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recovery drivers</CardTitle>
            <CardDescription>
              Lagged correlation of each behaviour/load with recovery, ranked by
              effect size. Low-confidence (thin or non-significant) links are
              shown but flagged — not over-claimed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CorrelationMatrix drivers={drivers} outcomeLabel="recovery" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
