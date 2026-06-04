import { RecoveryCalendar } from "@/components/charts/recovery-calendar";
import { TrendChart } from "@/components/charts/trend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildTrend, type TrendPoint } from "@/lib/analytics/trend";
import type { DaySeries, EventRow } from "@/lib/analytics/types";
import {
  clampEventsToRange,
  formatRangeLabel,
  parseRange,
} from "@/lib/date-range";
import {
  getEvents,
  getRecoveryDays,
  getRecoverySeries,
} from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let calendar: DaySeries = [];
  let hrv: TrendPoint[] = [];
  let rhr: TrendPoint[] = [];
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    const [days, recovery, eventRows] = await Promise.all([
      getRecoveryDays(),
      getRecoverySeries(range),
      getEvents(range),
    ]);
    calendar = days;
    events = clampEventsToRange(eventRows, range);
    hrv = buildTrend(
      recovery.map((r) => ({ day: r.day, value: r.hrvRmssdMilli })),
      range,
    );
    rhr = buildTrend(
      recovery.map((r) => ({ day: r.day, value: r.restingHr })),
      range,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recovery</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Full-history calendar · trends over {formatRangeLabel(range)}.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Red is low, green is high recovery.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : calendar.length ? (
            <RecoveryCalendar data={calendar} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No recovery data yet — connect WHOOP and run a sync.
            </p>
          )}
        </CardContent>
      </Card>

      {!error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendCard
            title="Heart rate variability"
            description="RMSSD, with EWMA and 30-day baseline band."
            data={hrv}
            unit=" ms"
            precision={1}
            events={events}
          />
          <TrendCard
            title="Resting heart rate"
            description="With EWMA and 30-day baseline band."
            data={rhr}
            unit=" bpm"
            precision={0}
            events={events}
          />
        </div>
      )}
    </div>
  );
}

function TrendCard({
  title,
  description,
  data,
  unit,
  precision,
  events,
}: {
  title: string;
  description: string;
  data: TrendPoint[];
  unit: string;
  precision: number;
  events: EventRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TrendChart
          data={data}
          unit={unit}
          precision={precision}
          events={events}
        />
      </CardContent>
    </Card>
  );
}
