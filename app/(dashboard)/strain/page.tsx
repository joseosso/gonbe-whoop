import { formatRangeLabel, parseRange } from "@/lib/date-range";

export default async function StrainPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = parseRange(await searchParams);

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Strain</h1>
      <p className="text-muted-foreground text-sm">
        Showing {formatRangeLabel(range)}.
      </p>
      <p className="text-muted-foreground mt-8 text-sm">
        Strain dashboard — load, strain-vs-recovery, and HR-zone mix — arrives in
        Phase 1.7.
      </p>
    </div>
  );
}
