import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Database,
  Moon,
  ShieldAlert,
  Zap,
} from "lucide-react";

import {
  MetricCard,
  type MetricCardProps,
} from "@/components/charts/metric-card";
import { RecoveryForecast } from "@/components/charts/recovery-forecast";
import { StrainRadar } from "@/components/charts/strain-radar";
import { TrainingBrief } from "@/components/charts/training-brief";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";
import { acwrSeries } from "@/lib/analytics/acwr";
import { densify } from "@/lib/analytics/dates";
import {
  backtestForecast,
  buildForecast,
  currentForecast,
  type BacktestResult,
  type ForecastPoint,
} from "@/lib/analytics/forecast";
import { summarizeMetric } from "@/lib/analytics/overview";
import { loadBrief } from "@/lib/insights/brief-data";
import type { BriefPayload } from "@/lib/insights/brief";
import { sleepDebt, sleepNights } from "@/lib/analytics/sleep-debt";
import {
  buildRadar,
  buildRadarSignals,
  type RadarResult,
} from "@/lib/analytics/strain-radar";
import type { DaySeries } from "@/lib/analytics/types";
import { formatRangeLabel, parseRange } from "@/lib/date-range";
import {
  getDataSummary,
  getRecoverySeries,
  getSleepSeries,
  getStrainSeries,
  type DataSummary,
} from "@/lib/db/queries";
import { isConnected } from "@/lib/whoop/oauth";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

type Metric = Pick<
  MetricCardProps,
  "label" | "unit" | "precision" | "series" | "summary" | "accent" | "direction"
>;

const metric = (
  label: string,
  unit: string,
  precision: number,
  series: DaySeries,
  accent: MetricCardProps["accent"],
  direction: MetricCardProps["direction"],
): Metric => ({
  label,
  unit,
  precision,
  series,
  summary: summarizeMetric(series),
  accent,
  direction,
});

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  let connected = false;
  let summary: DataSummary | null = null;
  let metrics: Metric[] = [];
  let radar: RadarResult | null = null;
  let forecast: ForecastPoint | null = null;
  let backtest: BacktestResult | null = null;
  let brief: BriefPayload | null = null;
  let setupError: string | null = null;

  try {
    const [conn, sum, recovery, strain, sleep, briefPayload] =
      await Promise.all([
        isConnected(),
        getDataSummary(),
        getRecoverySeries(range),
        getStrainSeries(range),
        getSleepSeries(range),
        // Today-anchored, independent of the selected range, so the call is
        // always current with stable baselines.
        loadBrief(),
      ]);
    connected = conn;
    summary = sum;
    brief = briefPayload;

    metrics = [
      metric(
        "Recovery",
        "%",
        0,
        densify(
          recovery.map((r) => ({ day: r.day, value: r.recoveryScore })),
          range,
        ),
        "emerald",
        "up",
      ),
      metric(
        "Day Strain",
        "",
        1,
        densify(
          strain.map((r) => ({ day: r.day, value: r.strain })),
          range,
        ),
        "sky",
        "neutral",
      ),
      metric(
        "Sleep Performance",
        "%",
        0,
        densify(
          sleep.map((r) => ({ day: r.day, value: r.performancePct })),
          range,
        ),
        "violet",
        "up",
      ),
    ];

    // Illness & strain early-warning radar: fuse the body-stress signals
    // (skin temp, RHR, HRV, resp rate, SpO2) vs each metric's own baseline.
    radar = buildRadar(buildRadarSignals(recovery, sleep, range));

    // Tomorrow's recovery forecast: a transparent weighted score over drivers we
    // already compute (today's strain, sleep debt, ACWR, HRV EWMA slope), with a
    // backtest over the range so the accuracy is honest.
    const recoveryDense = densify(
      recovery.map((r) => ({ day: r.day, value: r.recoveryScore })),
      range,
    );
    const strainDense = densify(
      strain.map((s) => ({ day: s.day, value: s.strain })),
      range,
    );
    const forecastPoints = buildForecast({
      recovery: recoveryDense,
      strain: strainDense,
      debt: sleepDebt(sleepNights(sleep, range)).map((p) => ({
        day: p.day,
        value: p.debtMilli,
      })),
      acwr: acwrSeries(strainDense).map((p) => ({ day: p.day, value: p.ratio })),
      hrv: densify(
        recovery.map((r) => ({ day: r.day, value: r.hrvRmssdMilli })),
        range,
      ),
    });
    forecast = currentForecast(forecastPoints);
    backtest = backtestForecast(forecastPoints, recoveryDense);
  } catch (e) {
    setupError =
      e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Latest vs 30-day baseline · {formatRangeLabel(range)}.
        </p>
      </header>

      {setupError ? (
        <SetupCard error={setupError} />
      ) : (
        <div className="flex flex-col gap-6">
          {brief && <TrainingBrief payload={brief} />}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <MetricCard key={m.label} {...m} />
            ))}
          </section>
          {(radar || forecast) && (
            <section className="grid gap-6 lg:grid-cols-2">
              {forecast && backtest && (
                <ForecastCard forecast={forecast} backtest={backtest} />
              )}
              {radar && <EarlyWarningCard radar={radar} />}
            </section>
          )}
          <ConnectionCard connected={connected} />
          {summary && <DataSummaryGrid summary={summary} />}
        </div>
      )}
    </div>
  );
}

function ForecastCard({
  forecast,
  backtest,
}: {
  forecast: ForecastPoint;
  backtest: BacktestResult;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" /> Tomorrow&apos;s recovery
        </CardTitle>
        <CardDescription>
          Predicted from today&apos;s strain, sleep debt, training load, and HRV
          trend vs your baselines.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RecoveryForecast forecast={forecast} backtest={backtest} />
      </CardContent>
    </Card>
  );
}

function EarlyWarningCard({ radar }: { radar: RadarResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4" /> Illness &amp; strain early-warning
        </CardTitle>
        <CardDescription>
          Skin temp, resting HR, HRV, respiratory rate, and SpO₂ fused against
          your own baselines. ≥ 2 signals off baseline flags a watch.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StrainRadar result={radar} />
      </CardContent>
    </Card>
  );
}

function ConnectionCard({ connected }: { connected: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          WHOOP connection
          {connected && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="text-emerald-500" /> Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {connected
            ? "Pull your latest cycles, recovery, sleep, and workouts."
            : "Authorize WHOOP to start importing your data."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connected ? (
          <SyncButton />
        ) : (
          <Button asChild className="w-fit">
            <a href="/api/auth/whoop">Connect WHOOP</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DataSummaryGrid({ summary }: { summary: DataSummary }) {
  const stats = [
    { label: "Cycles", value: summary.counts.cycles, icon: Activity },
    { label: "Recoveries", value: summary.counts.recoveries, icon: Zap },
    { label: "Sleeps", value: summary.counts.sleeps, icon: Moon },
    { label: "Workouts", value: summary.counts.workouts, icon: Database },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="size-4" /> {label}
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {value.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        {summary.lastSynced
          ? `Last synced ${summary.lastSynced.toLocaleString()}.`
          : "No data yet — connect WHOOP and run a sync."}
      </p>
    </section>
  );
}

function SetupCard({ error }: { error: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup needed</CardTitle>
        <CardDescription>
          The database isn&apos;t reachable yet. Set <code>DATABASE_URL</code>{" "}
          and the WHOOP credentials in <code>.env.local</code>, then run{" "}
          <code>npm run db:push</code>. See <code>SPEC.md</code> §8.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-destructive text-sm">{error}</p>
      </CardContent>
    </Card>
  );
}
