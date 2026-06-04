"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DayTagRow } from "@/lib/analytics/types";

/**
 * Per-day behavior tagging. Pick a day, see its tags, add (from the vocabulary
 * or free text) or remove them. Writes go through `/api/tags`; on success we
 * `router.refresh()` so the server-rendered tag list and driver analysis update.
 */
export function TagEditor({
  tags,
  vocab,
  today,
}: {
  tags: DayTagRow[];
  vocab: readonly string[];
  today: string;
}) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayTags = useMemo(
    () => tags.filter((t) => t.day === day).map((t) => t.tag),
    [tags, day],
  );
  const present = new Set(dayTags);

  async function mutate(method: "POST" | "DELETE", tag: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day, tag }),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Request failed.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function addCustom() {
    const tag = custom.trim().toLowerCase();
    if (!tag) return;
    setCustom("");
    void mutate("POST", tag);
  }

  const disabled = busy || pending;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Day</span>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => setDay(e.target.value)}
          className="border-input bg-background h-9 w-fit rounded-md border px-3 text-sm"
        />
      </label>

      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {dayTags.length === 0 ? (
          <span className="text-muted-foreground text-sm">No tags on this day.</span>
        ) : (
          dayTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={() => mutate("DELETE", tag)}
                className="hover:bg-muted-foreground/20 rounded-sm p-0.5 disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {vocab
          .filter((tag) => !present.has(tag))
          .map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => mutate("POST", tag)}
            >
              <Plus className="size-3" /> {tag}
            </Button>
          ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          placeholder="custom tag…"
          maxLength={40}
          disabled={disabled}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || !custom.trim()}
          onClick={addCustom}
        >
          Add
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
