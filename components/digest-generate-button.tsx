"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Trigger weekly-digest generation for the current week via `/api/digest`, then
 * `router.refresh()` so the server-rendered card stack picks up the new row.
 */
export function DigestGenerateButton({
  label = "Generate this week",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Generation failed.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={generate} disabled={disabled} className="w-fit">
        <Sparkles className={disabled ? "animate-pulse" : undefined} />
        {disabled ? "Generating…" : label}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
