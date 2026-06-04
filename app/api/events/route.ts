import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";

export const runtime = "nodejs";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createBody = z
  .object({
    startDay: DAY,
    endDay: DAY.nullish(),
    label: z.string().trim().min(1).max(120),
    type: z.string().trim().toLowerCase().min(1).max(40).nullish(),
  })
  .refine((e) => !e.endDay || e.endDay >= e.startDay, {
    message: "endDay must be on or after startDay",
    path: ["endDay"],
  });
const removeBody = z.object({ id: z.number().int().positive() });

const badRequest = (error: string) =>
  NextResponse.json({ ok: false, error }, { status: 400 });

/** Create a life event (single- or multi-day) overlaid on the time-series. */
export async function POST(req: NextRequest) {
  const parsed = createBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid event payload.");
  }
  const { startDay, endDay, label, type } = parsed.data;

  const [row] = await db
    .insert(events)
    .values({ startDay, endDay: endDay || null, label, type: type || null })
    .returning({ id: events.id });

  return NextResponse.json({ ok: true, id: row.id });
}

/** Delete a life event by id. */
export async function DELETE(req: NextRequest) {
  const parsed = removeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid event payload.");

  await db.delete(events).where(eq(events.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
