import { formatRangeLabel, parseRange } from "@/lib/date-range";

export default async function SleepPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Sleep</h1>
      <p className="text-muted-foreground text-sm">
        Showing {formatRangeLabel(range)}.
      </p>
      <p className="text-muted-foreground mt-8 text-sm">
        Sleep dashboard — stages, debt, and regularity — arrives in Phase 1.6.
      </p>
    </div>
  );
}
