import { WHOOP_STRAIN_MAX, type AcwrStatus } from "@/lib/analytics/acwr";
import type { RecoveryBand } from "@/lib/analytics/forecast";
import type { RadarStatus } from "@/lib/analytics/strain-radar";
import type { Day } from "@/lib/analytics/types";

/**
 * Morning Training Brief (Plan §5.1). Deterministic: one actionable directive for
 * today's training, fused from analytics we already compute — today's recovery
 * band, tomorrow's forecast (§4.3), the safe-strain budget (§4.1), the
 * illness/early-warning radar (§4.2), ACWR status (§2.4), and sleep-debt
 * direction (§1.6). The rules here are pure and explainable: every input maps to
 * a reason, and the most restrictive guardrail sets the verdict. An optional
 * prose layer can wrap this output later behind a flag (as with the digest).
 */

/** Today's training call, most permissive → most restrictive. */
export type Verdict = "rest" | "easy" | "moderate" | "hard";

/** Reason tone — drives the card accent and mirrors the digest severities. */
export type ReasonTone = "good" | "neutral" | "watch" | "alert";

/** One line of evidence behind the verdict. */
export interface BriefReason {
  /** Stable key (one per contributing factor), for predictable rendering. */
  id: string;
  text: string;
  tone: ReasonTone;
}

/** Distilled analytics for one day — assembled by the server, kept pure here. */
export interface BriefInput {
  /** The day the brief is for (latest data day), or `null` when there's none. */
  day: Day | null;
  /** Today's recovery score (0–100) and band. */
  recovery: { score: number | null; band: RecoveryBand | null };
  /** Tomorrow's forecast score and band. */
  forecast: { score: number | null; band: RecoveryBand | null };
  /** Current acute:chronic workload ratio and its status band. */
  acwr: { ratio: number | null; status: AcwrStatus | null };
  /** Safe-strain budget for today (raw §4.1 result); `null` on thin history. */
  strainCeiling: number | null;
  /** Trailing sleep debt now (hours) and its change vs ~a week ago. */
  sleepDebtHours: { now: number | null; trend: number | null };
  /** Illness/strain early-warning radar; `null` when no signals have data. */
  earlyWarning: {
    status: RadarStatus;
    breachCount: number;
    drivers: { label: string; z: number }[];
  } | null;
}

/** The brief payload rendered on the Overview card. */
export interface BriefPayload {
  day: Day | null;
  verdict: Verdict;
  headline: string;
  /** Safe-strain ceiling (raw budget); `null` on thin history. */
  strainCeiling: number | null;
  /** Ceiling exceeds the WHOOP max (21) → load isn't today's limiter. */
  fullHeadroom: boolean;
  /** Evidence behind the verdict, in priority order. */
  reasons: BriefReason[];
  /** True when too little history backs the call — shown as a caveat. */
  lowConfidence: boolean;
}

// Thresholds — explicit so the brief's behaviour is easy to tune.
/** Trailing sleep debt (hours) above which we cap intensity. */
const SLEEP_DEBT_CAP_HOURS = 6;
/** Sleep-debt drop (hours) worth calling out as progress. */
const SLEEP_DEBT_IMPROVE_HOURS = 1;

const RANK: Record<Verdict, number> = { rest: 0, easy: 1, moderate: 2, hard: 3 };
/** Take the more restrictive (lower-ranked) of two verdicts. */
const cap = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);

const HEADLINE: Record<Verdict, string> = {
  hard: "Green-light a hard session",
  moderate: "Moderate session today",
  easy: "Keep it easy today",
  rest: "Rest and recover today",
};

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const sz = (z: number) => `${z >= 0 ? "+" : ""}${r1(z)}`;

/**
 * Build today's training brief. Starts optimistic (`hard`) and lets each
 * guardrail — illness, ACWR, recovery, sleep debt — pull the verdict down; the
 * most restrictive wins. Every guardrail also emits an explainable reason. With
 * no usable signals the call is held at `moderate` and flagged low-confidence
 * (we don't green-light a hard day on no evidence).
 */
export function buildBrief(input: BriefInput): BriefPayload {
  const reasons: BriefReason[] = [];
  let verdict: Verdict = "hard";

  const hasRecovery = input.recovery.score !== null;
  const hasAcwr = input.acwr.ratio !== null;
  const lowConfidence = !hasRecovery && !hasAcwr;

  // 1. Illness / early-warning radar — the top guardrail.
  const ew = input.earlyWarning;
  if (ew && ew.status !== "ok") {
    const drivers = ew.drivers
      .map((d) => `${d.label} z=${sz(d.z)}`)
      .join(", ");
    if (ew.status === "alert") {
      verdict = cap(verdict, "rest");
      reasons.push({
        id: "illness",
        tone: "alert",
        text: `Illness watch: ${ew.breachCount} body-stress signals off baseline (${drivers}). Rest and recheck after a good night's sleep.`,
      });
    } else {
      verdict = cap(verdict, "easy");
      reasons.push({
        id: "illness",
        tone: "watch",
        text: `Early-warning: ${ew.breachCount} signals off baseline (${drivers}). Ease off and watch for illness.`,
      });
    }
  }

  // 2. Training load (ACWR).
  if (input.acwr.ratio !== null && input.acwr.status !== null) {
    const ratio = input.acwr.ratio.toFixed(2);
    switch (input.acwr.status) {
      case "elevated":
        verdict = cap(verdict, "easy");
        reasons.push({
          id: "acwr",
          tone: "alert",
          text: `Training load spiked (ACWR ${ratio}). Deload to bring it back into range.`,
        });
        break;
      case "high":
        verdict = cap(verdict, "moderate");
        reasons.push({
          id: "acwr",
          tone: "watch",
          text: `Load climbing (ACWR ${ratio}). Keep week-on-week jumps small.`,
        });
        break;
      case "optimal":
        reasons.push({
          id: "acwr",
          tone: "good",
          text: `Training load optimal (ACWR ${ratio}) — sustainable.`,
        });
        break;
      case "low":
        reasons.push({
          id: "acwr",
          tone: "neutral",
          text: `Load light (ACWR ${ratio}) — room to build if you feel good.`,
        });
        break;
    }
  }

  // 3. Today's recovery band.
  if (input.recovery.band !== null && input.recovery.score !== null) {
    const score = r0(input.recovery.score);
    switch (input.recovery.band) {
      case "red":
        verdict = cap(verdict, "easy");
        reasons.push({
          id: "recovery",
          tone: "watch",
          text: `Recovery red (${score}%) — under-recovered today.`,
        });
        break;
      case "amber":
        verdict = cap(verdict, "moderate");
        reasons.push({
          id: "recovery",
          tone: "neutral",
          text: `Recovery amber (${score}%) — moderate capacity.`,
        });
        break;
      case "green":
        reasons.push({
          id: "recovery",
          tone: "good",
          text: `Recovery green (${score}%) — primed to absorb load.`,
        });
        break;
    }
  }

  // 4. Sleep debt.
  const debt = input.sleepDebtHours.now;
  const trend = input.sleepDebtHours.trend;
  if (debt !== null) {
    if (debt >= SLEEP_DEBT_CAP_HOURS) {
      verdict = cap(verdict, "moderate");
      reasons.push({
        id: "sleep",
        tone: "watch",
        text: `Sleep debt ~${r1(debt)}h — favour quality over volume and protect tonight's sleep.`,
      });
    } else if (trend !== null && trend <= -SLEEP_DEBT_IMPROVE_HOURS) {
      reasons.push({
        id: "sleep",
        tone: "good",
        text: `Sleep debt down ~${r1(-trend)}h — recovering well.`,
      });
    }
  }

  // 5. Tomorrow's forecast — informational, doesn't cap today.
  if (input.forecast.band === "red") {
    reasons.push({
      id: "forecast",
      tone: "watch",
      text: "Tomorrow's recovery projects red — bank sleep tonight.",
    });
  } else if (input.forecast.band === "green") {
    reasons.push({
      id: "forecast",
      tone: "good",
      text: "Tomorrow's recovery projects green.",
    });
  }

  // Thin history: never green-light a hard day on no evidence.
  if (lowConfidence) {
    verdict = cap(verdict, "moderate");
    reasons.push({
      id: "confidence",
      tone: "neutral",
      text: "Limited recent history — treat this as a rough guide.",
    });
  }

  // Strain ceiling (only relevant when training is on the table).
  const fullHeadroom =
    input.strainCeiling !== null && input.strainCeiling >= WHOOP_STRAIN_MAX;
  if (verdict !== "rest") {
    if (fullHeadroom) {
      reasons.push({
        id: "ceiling",
        tone: "good",
        text: "Full strain headroom — training load isn't today's limiter.",
      });
    } else if (input.strainCeiling !== null) {
      reasons.push({
        id: "ceiling",
        tone: "neutral",
        text: `Keep day strain under ~${r1(input.strainCeiling)} to hold ACWR in the sweet spot.`,
      });
    }
  }

  return {
    day: input.day,
    verdict,
    headline: HEADLINE[verdict],
    strainCeiling: input.strainCeiling,
    fullHeadroom,
    reasons,
    lowConfidence,
  };
}
