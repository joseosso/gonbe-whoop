import { NextResponse, type NextRequest } from "next/server";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { z } from "zod";

import { acwrSeries } from "@/lib/analytics/acwr";
import { meanStdev } from "@/lib/analytics/baseline";
import { dayOfWeekEffect } from "@/lib/analytics/day-of-week";
import { densify, eachDay } from "@/lib/analytics/dates";
import { tagDrivers } from "@/lib/analytics/driver-analysis";
import { OVERVIEW_WINDOW } from "@/lib/analytics/overview";
import { buildRadar, buildRadarSignals } from "@/lib/analytics/strain-radar";
import {
  sleepDebt,
  SLEEP_DEBT_WINDOW,
  type SleepNight,
} from "@/lib/analytics/sleep-debt";
import type { Day, DayRange, DaySeries } from "@/lib/analytics/types";
import { isMeaningful, zScore } from "@/lib/analytics/zscore";
import {
  getAllDayTags,
  getRecoveryDays,
  getRecoverySeries,
  getSleepPerformanceDays,
  getSleepSeries,
  getStrainDays,
  saveDigest,
} from "@/lib/db/queries";
import {
  buildDigest,
  type DigestAnomaly,
  type DigestInput,
} from "@/lib/insights/digest";

export const runtime = "nodejs";

const MS_PER_HOUR = 3_600_000;
const ANOMALY_WINDOW = 30;

const body = z
  .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
  .nullish();

const day = (d: Date): Day => format(d, "yyyy-MM-dd");
const shift = (d: Day, n: number): Day => day(addDays(parseISO(d), n));
const toHours = (milli: number | null) =>
  milli === null ? null : milli / MS_PER_HOUR;

/** Mean of a full series over an inclusive local-day window. */
function meanOver(series: DaySeries, range: DayRange): number | null {
  const values = series
    .filter((p) => p.day >= range.from && p.day <= range.to)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  return meanStdev(values).mean;
}

/** Sum of components, or null when every component is missing. */
const sumOrNull = (parts: (number | null)[]) =>
  parts.every((p) => p === null)
    ? null
    : parts.reduce<number>((acc, p) => acc + (p ?? 0), 0);

/**
 * Flag this week's days whose value deviates |z| ≥ 1.5 from the trailing
 * `ANOMALY_WINDOW`-day baseline (excluding the day itself, to avoid self-bias).
 */
function weekAnomalies(
  metric: string,
  series: DaySeries,
  anchorFrom: Day,
  weekEnd: Day,
  weekDays: Set<Day>,
): DigestAnomaly[] {
  const dense = densify(series, { from: anchorFrom, to: weekEnd });
  const out: DigestAnomaly[] = [];
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (p.value === null || !weekDays.has(p.day)) continue;
    const prior = dense
      .slice(Math.max(0, i - ANOMALY_WINDOW), i)
      .map((q) => q.value)
      .filter((v): v is number => v !== null);
    const z = zScore(p.value, meanStdev(prior));
    if (isMeaningful(z)) out.push({ metric, day: p.day, z: z as number });
  }
  return out;
}

/** Generate (and cache) the rule-based weekly digest for a week. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  // Normalise to the Monday of the requested (or current) week so the cache key
  // is stable and regeneration is idempotent.
  const anchor = parsed.data?.weekStart
    ? parseISO(parsed.data.weekStart)
    : new Date();
  const weekStart = day(startOfWeek(anchor, { weekStartsOn: 1 }));
  const weekEnd = shift(weekStart, 6);

  try {
    const debtFrom = shift(weekStart, -(SLEEP_DEBT_WINDOW - 1));
    // Radar scores each signal's latest value vs its trailing 30-day baseline.
    const radarRange = { from: shift(weekEnd, -(OVERVIEW_WINDOW + 1)), to: weekEnd };
    // One sleep fetch covers both the debt (14-night) and radar (30-day)
    // lookbacks; the radar's reaches further back, so use the earlier start.
    const sleepFrom = radarRange.from < debtFrom ? radarRange.from : debtFrom;
    const [recovery, strain, sleepPerf, tags, sleepWindow, radarRecovery] =
      await Promise.all([
        getRecoveryDays(),
        getStrainDays(),
        getSleepPerformanceDays(),
        getAllDayTags(),
        getSleepSeries({ from: sleepFrom, to: weekEnd }),
        getRecoverySeries(radarRange),
      ]);

    // Recovery: this week vs prior week.
    const recoveryInput = {
      thisWeek: meanOver(recovery, { from: weekStart, to: weekEnd }),
      priorWeek: meanOver(recovery, {
        from: shift(weekStart, -7),
        to: shift(weekStart, -1),
      }),
    };

    // Sleep debt at the week's start vs end (trailing 14-night sum).
    const debtByDay = new Map(sleepWindow.map((s) => [s.day, s]));
    const nights: SleepNight[] = eachDay({ from: debtFrom, to: weekEnd }).map(
      (d) => {
        const s = debtByDay.get(d);
        return {
          day: d,
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
      },
    );
    const debtByDayMilli = new Map(
      sleepDebt(nights).map((p) => [p.day, p.debtMilli]),
    );
    const sleepDebtHours = {
      start: toHours(debtByDayMilli.get(weekStart) ?? null),
      end: toHours(debtByDayMilli.get(weekEnd) ?? null),
    };

    // ACWR at week end (trailing 7d ÷ 28d mean strain).
    const acwrPoint = acwrSeries(
      densify(strain, { from: shift(weekEnd, -34), to: weekEnd }),
    ).at(-1);
    const acwr = {
      ratio: acwrPoint?.ratio ?? null,
      status: acwrPoint?.status ?? null,
    };

    // Most notable recovery day-of-week effect (largest |delta|, n ≥ 2).
    const dow = dayOfWeekEffect(recovery).byWeekday
      .filter((w) => w.delta !== null && w.n >= 2)
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))[0];
    const dayOfWeek = dow
      ? { weekday: dow.weekday, delta: dow.delta as number, n: dow.n }
      : null;

    // Strongest tag driver on next-day recovery (largest |delta|).
    const tagDays = new Map<string, Day[]>();
    for (const t of tags) {
      const list = tagDays.get(t.tag);
      if (list) list.push(t.day);
      else tagDays.set(t.tag, [t.day]);
    }
    const driver = tagDrivers(recovery, tagDays)
      .filter((d) => d.delta !== null)
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))[0];
    const tagDriver = driver
      ? {
          tag: driver.tag,
          delta: driver.delta as number,
          n: driver.taggedN,
          lowConfidence: driver.lowConfidence,
        }
      : null;

    // This week's anomalies across recovery, strain, and sleep performance.
    const weekDays = new Set(eachDay({ from: weekStart, to: weekEnd }));
    const anchorFrom = shift(weekStart, -ANOMALY_WINDOW);
    const anomalies = [
      ...weekAnomalies("Recovery", recovery, anchorFrom, weekEnd, weekDays),
      ...weekAnomalies("Strain", strain, anchorFrom, weekEnd, weekDays),
      ...weekAnomalies("Sleep", sleepPerf, anchorFrom, weekEnd, weekDays),
    ];

    // Illness & strain early-warning radar: fuse the body-stress signals at
    // week end vs each metric's own trailing baseline.
    const radar = buildRadar(
      buildRadarSignals(radarRecovery, sleepWindow, radarRange),
    );
    const earlyWarning =
      radar.day === null
        ? null
        : {
            status: radar.status,
            breachCount: radar.breachCount,
            drivers: radar.drivers.map((d) => ({
              label: d.label,
              z: d.z as number,
            })),
          };

    const input: DigestInput = {
      weekStart,
      recovery: recoveryInput,
      sleepDebtHours,
      acwr,
      dayOfWeek,
      tagDriver,
      anomalies,
      earlyWarning,
    };
    const payload = buildDigest(input);
    await saveDigest(weekStart, payload);

    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Digest generation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
