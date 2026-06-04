"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EventRow } from "@/lib/analytics/types";

/** Compact span label, e.g. `Jun 3` or `Jun 3 – Jun 7`. */
function spanLabel(e: EventRow): string {
  const start = format(parseISO(e.startDay), "MMM d, yyyy");
  if (!e.endDay || e.endDay === e.startDay) return start;
  return `${format(parseISO(e.startDay), "MMM d")} – ${format(parseISO(e.endDay), "MMM d, yyyy")}`;
}

/**
 * Create and delete life events (markers overlaid on the time-series charts).
 * Writes go through `/api/events`; on success we `router.refresh()`.
 */
export function EventEditor({
  events,
  types,
  today,
}: {
  events: EventRow[];
  types: readonly string[];
  today: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [startDay, setStartDay] = useState(today);
  const [endDay, setEndDay] = useState("");
  const [type, setType] = useState<string>(types[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE", body: object) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/events", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Request failed.");
      startTransition(() => router.refresh());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!label.trim()) return;
    const ok = await send("POST", {
      label: label.trim(),
      startDay,
      endDay: endDay || null,
      type: type || null,
    });
    if (ok) {
      setLabel("");
      setEndDay("");
    }
  }

  const disabled = busy || pending;
  const inputCls =
    "border-input bg-background h-9 rounded-md border px-3 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Label</span>
          <input
            type="text"
            value={label}
            placeholder="e.g. Marathon"
            maxLength={120}
            disabled={disabled}
            onChange={(e) => setLabel(e.target.value)}
            className={`${inputCls} w-44`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Start</span>
          <input
            type="date"
            value={startDay}
            disabled={disabled}
            onChange={(e) => setStartDay(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">End (optional)</span>
          <input
            type="date"
            value={endDay}
            min={startDay}
            disabled={disabled}
            onChange={(e) => setEndDay(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select
            value={type}
            disabled={disabled}
            onChange={(e) => setType(e.target.value)}
            className={inputCls}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !label.trim()}
          onClick={create}
        >
          Add event
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground w-44 shrink-0 tabular-nums">
                {spanLabel(e)}
              </span>
              <span className="flex-1 font-medium">{e.label}</span>
              {e.type && (
                <Badge variant="outline" className="capitalize">
                  {e.type}
                </Badge>
              )}
              <button
                type="button"
                aria-label={`Delete ${e.label}`}
                disabled={disabled}
                onClick={() => send("DELETE", { id: e.id })}
                className="text-muted-foreground hover:text-destructive rounded-sm p-1 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
