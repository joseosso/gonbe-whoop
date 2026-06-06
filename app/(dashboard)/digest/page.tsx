import { format, parseISO } from "date-fns";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

import { DigestGenerateButton } from "@/components/digest-generate-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLatestDigest, type CachedDigest } from "@/lib/db/queries";
import type { InsightCard, InsightSeverity } from "@/lib/insights/digest";

// Reads/writes live DB state; never prerender.
export const dynamic = "force-dynamic";

/** Per-severity presentation: icon, accent colours, badge style, sort rank. */
interface SeverityStyle {
  label: string;
  icon: LucideIcon;
  /** Lower sorts first — most urgent at the top of the stack. */
  rank: number;
  /** Left accent on the card. */
  border: string;
  /** Icon tint. */
  iconColor: string;
  /** Outline-badge colours. */
  badge: string;
}

const SEVERITY: Record<InsightSeverity, SeverityStyle> = {
  alert: {
    label: "Alert",
    icon: AlertOctagon,
    rank: 0,
    border: "border-l-destructive",
    iconColor: "text-destructive",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  watch: {
    label: "Watch",
    icon: AlertTriangle,
    rank: 1,
    border: "border-l-amber-500",
    iconColor: "text-amber-600 dark:text-amber-400",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  positive: {
    label: "Good",
    icon: CheckCircle2,
    rank: 2,
    border: "border-l-emerald-500",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  neutral: {
    label: "Info",
    icon: Info,
    rank: 3,
    border: "border-l-border",
    iconColor: "text-muted-foreground",
    badge: "border-border bg-muted text-muted-foreground",
  },
};

// Order severities surface in the summary chips (most urgent first).
const SUMMARY_ORDER: InsightSeverity[] = ["alert", "watch", "positive", "neutral"];

// Headline keyed by the most urgent severity present this week.
const HEADLINE: Record<InsightSeverity, string> = {
  alert: "A few signals need your attention",
  watch: "A couple of things to keep an eye on",
  positive: "Looking strong — keep it going",
  neutral: "A quiet, steady week",
};

export default async function DigestPage() {
  let digest: CachedDigest | null = null;
  let error: string | null = null;

  try {
    digest = await getLatestDigest();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  const weekLabel = digest
    ? `Week of ${format(parseISO(digest.weekStart), "MMM d, yyyy")}`
    : null;

  // Most urgent first; stable sort keeps the rule order within a severity.
  const cards = digest
    ? [...digest.payload.cards].sort(
        (a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank,
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly digest</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {weekLabel
              ? `${weekLabel} · generated ${digest!.generatedAt.toLocaleString()}`
              : "A plain-language read on what changed and what to do."}
          </p>
        </div>
        <DigestGenerateButton />
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !digest ? (
        <EmptyState />
      ) : cards.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              Nothing notable this week
            </CardTitle>
            <CardDescription>
              No signals crossed their thresholds — quiet is good.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <SummaryBanner cards={cards} />
          <div className="flex flex-col gap-3">
            {cards.map((card) => (
              <DigestCard key={card.id} card={card} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** At-a-glance headline + per-severity counts for the week. */
function SummaryBanner({ cards }: { cards: InsightCard[] }) {
  const counts = SUMMARY_ORDER.map((sev) => ({
    sev,
    n: cards.filter((c) => c.severity === sev).length,
  })).filter((c) => c.n > 0);

  // Cards are pre-sorted by rank, so the first one carries the top severity.
  const top = cards[0].severity;
  const TopIcon = SEVERITY[top].icon;

  return (
    <Card className={`border-l-4 ${SEVERITY[top].border} gap-0 py-0`}>
      <div className="flex items-center gap-3 p-5">
        <TopIcon className={`${SEVERITY[top].iconColor} size-6 shrink-0`} />
        <div className="flex flex-col gap-2">
          <p className="font-medium">{HEADLINE[top]}</p>
          <div className="flex flex-wrap gap-1.5">
            {counts.map(({ sev, n }) => (
              <Badge
                key={sev}
                variant="outline"
                className={SEVERITY[sev].badge}
              >
                {n} {SEVERITY[sev].label.toLowerCase()}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DigestCard({ card }: { card: InsightCard }) {
  const sev = SEVERITY[card.severity];
  const Icon = sev.icon;
  return (
    <Card className={`border-l-4 ${sev.border} gap-0 py-0`}>
      <div className="flex gap-3 p-5">
        <Icon className={`${sev.iconColor} mt-0.5 size-5 shrink-0`} />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-snug">{card.title}</h3>
            <Badge variant="outline" className={`${sev.badge} mt-0.5`}>
              {sev.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{card.detail}</p>
          {card.action && (
            <div className="bg-muted/60 mt-1 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <Lightbulb className="text-foreground/70 mt-0.5 size-4 shrink-0" />
              <span className="text-foreground">{card.action}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No digest yet</CardTitle>
        <CardDescription>
          Generate this week&apos;s digest to see a plain-language read on your
          illness early-warning signals, recovery trend, sleep debt, training
          load, weekday patterns, tag drivers, and anomalies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DigestGenerateButton />
      </CardContent>
    </Card>
  );
}
