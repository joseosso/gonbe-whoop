import type { AcwrStatus } from "@/lib/analytics/acwr";
import type { Day } from "@/lib/analytics/types";

/**
 * Rule-based weekly digest (SPEC §5/§6). Deterministic: the same inputs always
 * yield the same cards, with no LLM dependency. The pure rules here turn already
 * -computed analytics into a ranked card stack ("what changed / what to do"); an
 * optional prose layer can wrap this output later behind a flag.
 */

export type InsightSeverity = "positive" | "neutral" | "watch" | "alert";

/** One digest card: a headline ("what changed") and guidance ("what to do"). */
export interface InsightCard {
  /** Stable key (one per rule), so re-rendering/diffing is predictable. */
  id: string;
  title: string;
  detail: string;
  severity: InsightSeverity;
}

/** A flagged single-day deviation (|z| ≥ 1.5) feeding the anomalies rule. */
export interface DigestAnomaly {
  metric: string;
  day: Day;
  z: number;
}

/**
 * Pre-computed analytics for one week. The route handler assembles this from the
 * query + analytics layers so the rules stay pure and unit-testable. Every field
 * is nullable: a rule that lacks its inputs simply emits no card.
 */
export interface DigestInput {
  weekStart: Day;
  /** Mean recovery % this week vs the prior week. */
  recovery: { thisWeek: number | null; priorWeek: number | null };
  /** Trailing sleep-debt (hours) at the week's start vs its end. */
  sleepDebtHours: { start: number | null; end: number | null };
  /** Current acute:chronic workload ratio and its status band. */
  acwr: { ratio: number | null; status: AcwrStatus | null };
  /** Most notable recovery day-of-week effect (largest |delta|). */
  dayOfWeek: { weekday: string; delta: number; n: number } | null;
  /** Strongest tag driver on next-day recovery (largest |delta|). */
  tagDriver: {
    tag: string;
    delta: number;
    n: number;
    lowConfidence: boolean;
  } | null;
  /** This week's |z| ≥ 1.5 anomalies. */
  anomalies: DigestAnomaly[];
}

/** The cached digest payload (stored as JSON per `week_start`). */
export interface DigestPayload {
  weekStart: Day;
  cards: InsightCard[];
}

// Rule thresholds — kept explicit so the digest's behavior is easy to tune.
const RECOVERY_DELTA_PP = 5;
const DEBT_DELTA_HOURS = 0.5;
const DOW_DELTA_PP = 4;
const TAG_DELTA_PP = 3;
const ALERT_Z = 2.5;

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

type Rule = (input: DigestInput) => InsightCard | null;

const recoveryTrend: Rule = ({ recovery }) => {
  const { thisWeek, priorWeek } = recovery;
  if (thisWeek === null) return null;
  if (priorWeek === null) {
    return {
      id: "recovery-trend",
      severity: "neutral",
      title: `Recovery averaged ${r0(thisWeek)}%`,
      detail: "No prior week to compare against yet — baseline forming.",
    };
  }
  const delta = thisWeek - priorWeek;
  if (delta >= RECOVERY_DELTA_PP) {
    return {
      id: "recovery-trend",
      severity: "positive",
      title: `Recovery up ${r0(delta)}pp vs last week`,
      detail: `Averaged ${r0(thisWeek)}%. A good window to absorb a little more load.`,
    };
  }
  if (delta <= -RECOVERY_DELTA_PP) {
    return {
      id: "recovery-trend",
      severity: "watch",
      title: `Recovery down ${r0(-delta)}pp vs last week`,
      detail: `Averaged ${r0(thisWeek)}%. Prioritise sleep and ease intensity.`,
    };
  }
  return {
    id: "recovery-trend",
    severity: "neutral",
    title: `Recovery steady at ${r0(thisWeek)}%`,
    detail: "Within ±5pp of last week.",
  };
};

const sleepDebtTrend: Rule = ({ sleepDebtHours }) => {
  const { start, end } = sleepDebtHours;
  if (end === null) return null;
  const now = `~${r1(Math.abs(end))}h ${end >= 0 ? "debt" : "banked"}`;
  if (start === null) {
    return {
      id: "sleep-debt",
      severity: end > 1 ? "watch" : "neutral",
      title: `Sleep debt ${now}`,
      detail: "Trailing 14-day need minus actual.",
    };
  }
  const change = end - start;
  if (change <= -DEBT_DELTA_HOURS) {
    return {
      id: "sleep-debt",
      severity: "positive",
      title: `Sleep debt down ${r1(-change)}h`,
      detail: `Now ${now}. You clawed back sleep this week.`,
    };
  }
  if (change >= DEBT_DELTA_HOURS) {
    return {
      id: "sleep-debt",
      severity: "watch",
      title: `Sleep debt up ${r1(change)}h`,
      detail: `Now ${now}. Aim for earlier, more consistent bedtimes.`,
    };
  }
  return {
    id: "sleep-debt",
    severity: "neutral",
    title: `Sleep debt steady (${now})`,
    detail: "Little change over the week.",
  };
};

const ACWR_COPY: Record<
  AcwrStatus,
  { severity: InsightSeverity; title: (r: string) => string; detail: string }
> = {
  optimal: {
    severity: "positive",
    title: (r) => `Training load optimal (ACWR ${r})`,
    detail: "Acute load sits in the 0.8–1.3 sweet spot — sustainable.",
  },
  high: {
    severity: "watch",
    title: (r) => `Training load climbing (ACWR ${r})`,
    detail: "Approaching the spike zone; keep week-on-week jumps small.",
  },
  elevated: {
    severity: "alert",
    title: (r) => `Training spike (ACWR ${r})`,
    detail: "Above 1.5 — elevated injury/illness risk. Add recovery.",
  },
  low: {
    severity: "neutral",
    title: (r) => `Training load light (ACWR ${r})`,
    detail: "Below 0.8 — room to build if you're feeling healthy.",
  },
};

const acwrStatusRule: Rule = ({ acwr }) => {
  const { ratio, status } = acwr;
  if (ratio === null || status === null) return null;
  const copy = ACWR_COPY[status];
  return {
    id: "acwr",
    severity: copy.severity,
    title: copy.title(ratio.toFixed(2)),
    detail: copy.detail,
  };
};

// Short weekday labels (from the analytics layer) → full names for prose.
const WEEKDAY_FULL: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

const dayOfWeekRule: Rule = ({ dayOfWeek }) => {
  if (!dayOfWeek || Math.abs(dayOfWeek.delta) < DOW_DELTA_PP) return null;
  const { weekday, delta, n } = dayOfWeek;
  const name = WEEKDAY_FULL[weekday] ?? weekday;
  const dir = delta > 0 ? "above" : "below";
  return {
    id: "day-of-week",
    severity: delta < 0 ? "watch" : "positive",
    title: `${name}s run ${r0(Math.abs(delta))}pp ${dir} your average`,
    detail:
      delta < 0
        ? `Across n=${n} ${name}s. Worth protecting recovery around then.`
        : `Across n=${n} ${name}s — a reliably strong day.`,
  };
};

const tagDriverRule: Rule = ({ tagDriver }) => {
  if (!tagDriver || Math.abs(tagDriver.delta) < TAG_DELTA_PP) return null;
  const { tag, delta, n, lowConfidence } = tagDriver;
  const dir = delta < 0 ? "lower" : "higher";
  return {
    id: "tag-driver",
    severity: lowConfidence ? "neutral" : delta < 0 ? "watch" : "positive",
    title: `“${tag}” days precede ${r0(Math.abs(delta))}pp ${dir} recovery`,
    detail: `Next-day recovery delta over n=${n} tagged days.${
      lowConfidence ? " Low confidence — small sample." : ""
    }`,
  };
};

const anomaliesRule: Rule = ({ anomalies }) => {
  if (anomalies.length === 0) return null;
  const list = anomalies
    .map((a) => `${a.metric} ${a.day} (z=${a.z >= 0 ? "+" : ""}${r1(a.z)})`)
    .join("; ");
  return {
    id: "anomalies",
    severity: anomalies.some((a) => Math.abs(a.z) >= ALERT_Z) ? "alert" : "watch",
    title: `${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} this week`,
    detail: list,
  };
};

// Fixed order → deterministic card stack.
const RULES: Rule[] = [
  recoveryTrend,
  sleepDebtTrend,
  acwrStatusRule,
  dayOfWeekRule,
  tagDriverRule,
  anomaliesRule,
];

/** Run every rule and collect the cards that fired (SPEC §5 weekly digest). */
export function buildDigest(input: DigestInput): DigestPayload {
  const cards = RULES.map((rule) => rule(input)).filter(
    (card): card is InsightCard => card !== null,
  );
  return { weekStart: input.weekStart, cards };
}
