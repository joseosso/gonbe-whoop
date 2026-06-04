import {
  SleepDebtChart,
  SleepStagesChart,
  type DebtPoint,
  type StagePoint,
} from "@/components/charts/sleep-stages";
import { TrendChart } from "@/components/charts/trend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { eachDay, localClockMinutes } from "@/lib/analytics/dates";
import { regularityIndex, type Regularity } from "@/lib/analytics/regularity";
import { sleepDebt, type SleepNight } from "@/lib/analytics/sleep-debt";
import { buildTrend, type TrendPoint } from "@/lib/analytics/trend";
import type { EventRow } from "@/lib/analytics/types";
import {
  clampEventsToRange,
  formatRangeLabel,
  parseRange,
} from "@/lib/date-range";
import { getEvents, getSleepSeries } from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

const MS_PER_HOUR = 3_600_000;
const toHours = (milli: number | null) => (milli === null ? null : milli / MS_PER_HOUR);

/** Sum of components, or null when every component is missing. */
const sumOrNull = (parts: (number | null)[]) =>
  parts.every((p) => p === null)
    ? null
    : parts.reduce<number>((acc, p) => acc + (p ?? 0), 0);

export default async function SleepPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let stages: StagePoint[] = [];
  let debt: DebtPoint[] = [];
  let performance: TrendPoint[] = [];
  let efficiency: TrendPoint[] = [];
  let regularity: Regularity = { index: null, bedR: null, wakeR: null, n: 0 };
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    const [sleeps, eventRows] = await Promise.all([
      getSleepSeries(range),
      getEvents(range),
    ]);
    events = clampEventsToRange(eventRows, range);
    const byDay = new Map(sleeps.map((s) => [s.day, s]));
    const days = eachDay(range);

    stages = days.map((day) => {
      const s = byDay.get(day);
      return {
        day,
        light: s ? toHours(s.lightMilli) : null,
        sws: s ? toHours(s.swsMilli) : null,
        rem: s ? toHours(s.remMilli) : null,
        awake: s ? toHours(s.awakeMilli) : null,
      };
    });

    const nights: SleepNight[] = days.map((day) => {
      const s = byDay.get(day);
      return {
        day,
        needMilli: s
          ? sumOrNull([
              s.needBaselineMilli,
              s.needFromDebtMilli,
              s.needFromStrainMilli,
            ])
          : null,
        actualMilli: s
          ? sumOrNull([s.lightMilli, s.swsMilli, s.remMilli])
          : null,
      };
    });
    debt = sleepDebt(nights).map((p) => ({
      day: p.day,
      hours: toHours(p.debtMilli),
    }));

    performance = buildTrend(
      sleeps.map((s) => ({ day: s.day, value: s.performancePct })),
      range,
    );
    efficiency = buildTrend(
      sleeps.map((s) => ({ day: s.day, value: s.efficiencyPct })),
      range,
    );

    regularity = regularityIndex(
      sleeps.map((s) => ({
        bedMinute: localClockMinutes(s.startTime, s.tzOffset),
        wakeMinute: localClockMinutes(s.endTime, s.tzOffset),
      })),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sleep</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Main sleeps only (naps excluded) · {formatRangeLabel(range)}.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sleep stages</CardTitle>
              <CardDescription>
                Hours of REM, deep, light, and awake per night.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SleepStagesChart data={stages} events={events} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sleep performance</CardTitle>
                <CardDescription>
                  % of sleep need met, with EWMA and 30-day band.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={performance} unit="%" events={events} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sleep efficiency</CardTitle>
                <CardDescription>
                  % of time in bed asleep, with EWMA and 30-day band.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={efficiency} unit="%" events={events} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Sleep debt</CardTitle>
                <CardDescription>
                  Trailing 14-day cumulative (need − actual). Above zero = debt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SleepDebtChart data={debt} events={events} />
              </CardContent>
            </Card>
            <RegularityCard regularity={regularity} />
          </div>
        </>
      )}
    </div>
  );
}

function RegularityCard({ regularity }: { regularity: Regularity }) {
  const { index, n } = regularity;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regularity</CardTitle>
        <CardDescription>
          Bed/wake-time consistency (higher is steadier).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {index === null ? (
          <p className="text-muted-foreground text-sm">
            Not enough nights to score.
          </p>
        ) : (
          <>
            <span className="text-4xl font-semibold tabular-nums">
              {Math.round(index)}
              <span className="text-muted-foreground text-lg"> / 100</span>
            </span>
            <span className="text-muted-foreground text-xs">
              over {n} night{n === 1 ? "" : "s"}
            </span>
          </>
        )}
      </CardContent>
    </Card>
  );
}
