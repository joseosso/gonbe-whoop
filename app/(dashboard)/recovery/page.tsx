import { RecoveryCalendar } from "@/components/charts/recovery-calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRecoveryDays } from "@/lib/db/queries";

// Reads live DB state on every request — never prerender.
export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  let data: Awaited<ReturnType<typeof getRecoveryDays>> = [];
  let error: string | null = null;

  try {
    data = await getRecoveryDays();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recovery</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Daily recovery score across your full history.
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
          ) : data.length ? (
            <RecoveryCalendar data={data} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No recovery data yet — connect WHOOP and run a sync.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
