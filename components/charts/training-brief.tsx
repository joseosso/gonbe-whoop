import { Activity, BedDouble, Flame, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefPayload, ReasonTone, Verdict } from "@/lib/insights/brief";
import { cn } from "@/lib/utils";

/** Per-verdict icon + accent for the headline. */
const VERDICT: Record<
  Verdict,
  { icon: LucideIcon; label: string; ring: string; text: string }
> = {
  hard: {
    icon: Flame,
    label: "Hard OK",
    ring: "ring-emerald-500/40 bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  moderate: {
    icon: Activity,
    label: "Moderate",
    ring: "ring-sky-500/40 bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
  },
  easy: {
    icon: Waves,
    label: "Easy",
    ring: "ring-amber-500/40 bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  rest: {
    icon: BedDouble,
    label: "Rest",
    ring: "ring-rose-500/40 bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
  },
};

/** Per-tone bullet color for the reason list. */
const TONE_DOT: Record<ReasonTone, string> = {
  good: "bg-emerald-500",
  neutral: "bg-muted-foreground/50",
  watch: "bg-amber-500",
  alert: "bg-rose-500",
};

/**
 * Morning Training Brief card (Plan §5.1) — the day's directive on top of the
 * Overview, fused from recovery, forecast, training load, illness radar, and
 * sleep debt. Presentational: the verdict + reasons are computed in
 * `buildBrief`; this renders them.
 */
export function TrainingBrief({ payload }: { payload: BriefPayload }) {
  const v = VERDICT[payload.verdict];
  const Icon = v.icon;
  const ceiling = ceilingLabel(payload);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full ring-1",
                v.ring,
              )}
            >
              <Icon className={cn("size-5", v.text)} />
            </span>
            <div>
              <CardTitle className="text-lg">{payload.headline}</CardTitle>
              <CardDescription>
                Today&apos;s call · {ceiling}
                {payload.lowConfidence && " · low confidence"}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className={cn("shrink-0", v.text)}>
            {v.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {payload.reasons.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notable signals yet — sync to populate today&apos;s brief.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payload.reasons.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    TONE_DOT[r.tone],
                  )}
                />
                <span className="text-foreground/90">{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Short strain-ceiling phrase for the subtitle. */
function ceilingLabel(payload: BriefPayload): string {
  if (payload.verdict === "rest") return "no strain target";
  if (payload.fullHeadroom) return "full strain headroom";
  if (payload.strainCeiling === null) return "strain ceiling —";
  return `strain ceiling ~${Math.round(payload.strainCeiling * 10) / 10}`;
}
