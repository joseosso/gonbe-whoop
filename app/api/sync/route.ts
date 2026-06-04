import { NextResponse } from "next/server";

import { runSync } from "@/lib/whoop/sync";

export const runtime = "nodejs";
// Backfill can take a while; allow a long timeout on platforms that honor it.
export const maxDuration = 300;

/** Trigger a WHOOP sync (full backfill on first run, incremental after). */
export async function POST() {
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
