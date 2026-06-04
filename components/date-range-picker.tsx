"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatRangeLabel, parseRange } from "@/lib/date-range";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

/**
 * Global date-range control. Holds the range in the URL (`?from=&to=`) so every
 * Server Component can read it and refetch. Reads its current value straight
 * from the URL, so it always reflects deep-links and back/forward navigation.
 */
export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = parseRange({
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  function apply(from: Date, to: Date) {
    const next = new URLSearchParams(params);
    next.set("from", format(from, "yyyy-MM-dd"));
    next.set("to", format(to, "yyyy-MM-dd"));
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    // Re-seed the draft from the live URL range each time the popover opens.
    if (next) setDraft({ from: parseISO(range.from), to: parseISO(range.to) });
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="size-4" />
          <span suppressHydrationWarning>{formatRangeLabel(range)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                const to = new Date();
                apply(subDays(to, preset.days - 1), to);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          numberOfMonths={2}
          autoFocus
          defaultMonth={draft?.from}
          selected={draft}
          onSelect={setDraft}
        />
        <div className="flex justify-end gap-2 border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!draft?.from || !draft.to}
            onClick={() => {
              if (draft?.from && draft.to) apply(draft.from, draft.to);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
