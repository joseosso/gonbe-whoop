import { format } from "date-fns";

import { EventEditor } from "@/components/event-editor";
import { TagEditor } from "@/components/tag-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tagDrivers, type TagDriver } from "@/lib/analytics/driver-analysis";
import type { Day, DayTagRow, EventRow } from "@/lib/analytics/types";
import {
  getAllDayTags,
  getAllEvents,
  getHrvDays,
  getRecoveryDays,
} from "@/lib/db/queries";
import { EVENT_TYPES, TAG_VOCAB } from "@/lib/tags";

// Reads/writes live DB state; never prerender.
export const dynamic = "force-dynamic";

/** One row of the driver table: a tag's next-day recovery and HRV effects. */
interface DriverRow {
  tag: string;
  taggedN: number;
  recovery: TagDriver;
  hrv: TagDriver;
  lowConfidence: boolean;
}

export default async function TagsPage() {
  const today = format(new Date(), "yyyy-MM-dd");

  let tags: DayTagRow[] = [];
  let events: EventRow[] = [];
  let drivers: DriverRow[] = [];
  let error: string | null = null;

  try {
    const [allTags, recoveryDays, hrvDays, allEvents] = await Promise.all([
      getAllDayTags(),
      getRecoveryDays(),
      getHrvDays(),
      getAllEvents(),
    ]);
    tags = allTags;
    events = allEvents;

    // tag → days carrying it (full history) for next-day driver analysis.
    const tagDays = new Map<string, Day[]>();
    for (const t of allTags) {
      const list = tagDays.get(t.tag);
      if (list) list.push(t.day);
      else tagDays.set(t.tag, [t.day]);
    }

    const recoveryDrivers = tagDrivers(recoveryDays, tagDays);
    const hrvDrivers = tagDrivers(hrvDays, tagDays);
    const hrvByTag = new Map(hrvDrivers.map((d) => [d.tag, d]));

    drivers = recoveryDrivers.map((recovery) => {
      const hrv = hrvByTag.get(recovery.tag)!;
      return {
        tag: recovery.tag,
        taggedN: recovery.taggedN,
        recovery,
        hrv,
        lowConfidence: recovery.lowConfidence || hrv.lowConfidence,
      };
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tags & events</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Annotate days and see how each tag relates to your next-day recovery.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tag a day</CardTitle>
                <CardDescription>
                  Behaviors to correlate against recovery (travel, sick, …).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TagEditor tags={tags} vocab={TAG_VOCAB} today={today} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Events</CardTitle>
                <CardDescription>
                  Markers overlaid on the time-series charts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EventEditor events={events} types={EVENT_TYPES} today={today} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Driver analysis</CardTitle>
              <CardDescription>
                Mean <strong>next-day</strong> recovery &amp; HRV on tagged vs
                untagged days. Small samples are flagged low-confidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DriverTable drivers={drivers} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DriverTable({ drivers }: { drivers: DriverRow[] }) {
  if (drivers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No tags yet — add a few above, then check back as days accumulate.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr className="border-b">
            <th className="py-2 pr-4 font-medium">Tag</th>
            <th className="py-2 pr-4 font-medium tabular-nums">Days</th>
            <th className="py-2 pr-4 font-medium">Next-day recovery Δ</th>
            <th className="py-2 pr-4 font-medium">Next-day HRV Δ</th>
            <th className="py-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.tag} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{d.tag}</td>
              <td className="py-2 pr-4 tabular-nums">{d.taggedN}</td>
              <td className="py-2 pr-4">
                <DeltaCell driver={d.recovery} unit="%" precision={0} />
              </td>
              <td className="py-2 pr-4">
                <DeltaCell driver={d.hrv} unit=" ms" precision={1} />
              </td>
              <td className="py-2">
                {d.lowConfidence ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                  >
                    low
                  </Badge>
                ) : (
                  <Badge variant="secondary">ok</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeltaCell({
  driver,
  unit,
  precision,
}: {
  driver: TagDriver;
  unit: string;
  precision: number;
}) {
  if (driver.delta === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const sign = driver.delta > 0 ? "+" : "";
  const color =
    driver.delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : driver.delta < 0
        ? "text-destructive"
        : "text-foreground";
  const d = driver.effectSize;

  return (
    <span className="tabular-nums">
      <span className={color}>
        {sign}
        {driver.delta.toFixed(precision)}
        {unit}
      </span>
      {d !== null && (
        <span className="text-muted-foreground ml-1.5 text-xs">
          d={d.toFixed(2)}
        </span>
      )}
    </span>
  );
}
