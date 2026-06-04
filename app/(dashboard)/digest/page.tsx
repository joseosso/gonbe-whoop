import { format, parseISO } from "date-fns";

import { DigestGenerateButton } from "@/components/digest-generate-button";
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

/** Per-severity accent + label for the card stack. */
const SEVERITY: Record<
  InsightSeverity,
  { label: string; border: string; text: string }
> = {
  positive: {
    label: "Good",
    border: "border-l-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  neutral: { label: "Info", border: "border-l-border", text: "text-muted-foreground" },
  watch: {
    label: "Watch",
    border: "border-l-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  alert: { label: "Alert", border: "border-l-destructive", text: "text-destructive" },
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly digest</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {weekLabel
              ? `${weekLabel} · generated ${digest!.generatedAt.toLocaleString()}`
              : "A rule-based summary of what changed and what to do."}
          </p>
        </div>
        <DigestGenerateButton />
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !digest ? (
        <EmptyState />
      ) : digest.payload.cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No notable signals for this week — quiet is good.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {digest.payload.cards.map((card) => (
            <DigestCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ card }: { card: InsightCard }) {
  const sev = SEVERITY[card.severity];
  return (
    <Card className={`border-l-4 ${sev.border}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {card.title}
          <span className={`text-xs font-medium ${sev.text}`}>{sev.label}</span>
        </CardTitle>
        <CardDescription>{card.detail}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No digest yet</CardTitle>
        <CardDescription>
          Generate this week&apos;s digest to see a rule-based read on your
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
