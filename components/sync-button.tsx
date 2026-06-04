"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SyncResult } from "@/lib/whoop/sync";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function sync() {
    setLoading(true);
    setMessage(null);
    setError(false);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data: { ok: boolean; result?: SyncResult; error?: string } =
        await res.json();
      if (!data.ok || !data.result) throw new Error(data.error ?? "Sync failed");

      const r = data.result;
      setMessage(
        `Synced ${r.cycles} cycles · ${r.sleeps} sleeps · ${r.workouts} workouts · ${r.recoveries} recoveries.`,
      );
      router.refresh();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={sync} disabled={loading} className="w-fit">
        <RefreshCw className={loading ? "animate-spin" : undefined} />
        {loading ? "Syncing…" : "Sync now"}
      </Button>
      {message && (
        <p
          className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
