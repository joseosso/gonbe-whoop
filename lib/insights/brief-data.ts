import { format, subDays } from "date-fns";

import { acwrSeries, currentAcwr, priorLoads, strainBudget } from "@/lib/analytics/acwr";
import { densify } from "@/lib/analytics/dates";
import {
  buildForecast,
  currentForecast,
  recoveryBand,
} from "@/lib/analytics/forecast";
import { summarizeMetric } from "@/lib/analytics/overview";
import { sleepDebt, sleepNights } from "@/lib/analytics/sleep-debt";
import { buildRadar, buildRadarSignals } from "@/lib/analytics/strain-radar";
import type { Day, DayRange } from "@/lib/analytics/types";
import {
  getRecoverySeries,
  getSleepSeries,
  getStrainSeries,
} from "@/lib/db/queries";
import { buildBrief, type BriefInput, type BriefPayload } from "./brief";

/**
 * Server-side assembler for the Morning Training Brief. Fetches a fixed
 * today-anchored window (independent of the dashboard's selected range, so the
 * call is always current and its baselines are stable) and distills it into the
 * pure `BriefInput` that `buildBrief` consumes. Mirrors the digest route's
 * "assemble in IO, decide in pure rules" split.
 */

const MS_PER_HOUR = 3_600_000;
/** Lookback for the brief — comfortably covers the 30-day baselines + 28-day ACWR. */
const BRIEF_WINDOW_DAYS = 90;
/** Lag (days) for the sleep-debt trend comparison. */
const DEBT_TREND_LAG = 7;

const toHours = (milli: number | null) =>
  milli === null ? null : milli / MS_PER_HOUR;

/** Today's brief, computed live from a fixed trailing window ending today. */
export async function loadBrief(today = new Date()): Promise<BriefPayload> {
  const range: DayRange = {
    from: format(subDays(today, BRIEF_WINDOW_DAYS - 1), "yyyy-MM-dd"),
    to: format(today, "yyyy-MM-dd"),
  };

  const [recovery, strain, sleep] = await Promise.all([
    getRecoverySeries(range),
    getStrainSeries(range),
    getSleepSeries(range),
  ]);

  const recoveryDense = densify(
    recovery.map((r) => ({ day: r.day, value: r.recoveryScore })),
    range,
  );
  const strainDense = densify(
    strain.map((s) => ({ day: s.day, value: s.strain })),
    range,
  );

  // Today's recovery: latest non-null value + its band.
  const recSummary = summarizeMetric(recoveryDense);
  const recScore = recSummary.latest?.value ?? null;

  // Tomorrow's forecast (same drivers as the Overview forecast card).
  const debtSeries = sleepDebt(sleepNights(sleep, range));
  const forecast = currentForecast(
    buildForecast({
      recovery: recoveryDense,
      strain: strainDense,
      debt: debtSeries.map((p) => ({ day: p.day, value: p.debtMilli })),
      acwr: acwrSeries(strainDense).map((p) => ({ day: p.day, value: p.ratio })),
      hrv: densify(
        recovery.map((r) => ({ day: r.day, value: r.hrvRmssdMilli })),
        range,
      ),
    }),
  );

  // Training load + safe-strain ceiling for today.
  const acwrPoint = currentAcwr(acwrSeries(strainDense));
  const strainCeiling = strainBudget(priorLoads(strainDense));

  // Illness / early-warning radar.
  const radar = buildRadar(buildRadarSignals(recovery, sleep, range));

  // Sleep debt: now vs ~a week ago (positive trend = debt rising).
  const debtNow = debtSeries.at(-1)?.debtMilli ?? null;
  const debtPrior = debtSeries.at(-(DEBT_TREND_LAG + 1))?.debtMilli ?? null;
  const debtNowH = toHours(debtNow);
  const debtPriorH = toHours(debtPrior);

  // Anchor the brief on the most recent day with any signal.
  const day: Day | null =
    recSummary.latest?.day ?? radar.day ?? strainDense.at(-1)?.day ?? null;

  const input: BriefInput = {
    day,
    recovery: {
      score: recScore,
      band: recScore === null ? null : recoveryBand(recScore),
    },
    forecast: { score: forecast?.score ?? null, band: forecast?.band ?? null },
    acwr: { ratio: acwrPoint?.ratio ?? null, status: acwrPoint?.status ?? null },
    strainCeiling,
    sleepDebtHours: {
      now: debtNowH,
      trend:
        debtNowH !== null && debtPriorH !== null ? debtNowH - debtPriorH : null,
    },
    earlyWarning:
      radar.day === null
        ? null
        : {
            status: radar.status,
            breachCount: radar.breachCount,
            drivers: radar.drivers.map((d) => ({
              label: d.label,
              z: d.z as number,
            })),
          },
  };

  return buildBrief(input);
}
