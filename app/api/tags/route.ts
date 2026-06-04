import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { dayTags } from "@/lib/db/schema";

export const runtime = "nodejs";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const TAG = z.string().trim().toLowerCase().min(1).max(40);

const addBody = z.object({
  day: DAY,
  tag: TAG,
  note: z.string().trim().max(280).optional(),
});
const removeBody = z.object({ day: DAY, tag: TAG });

const badRequest = (error: string) =>
  NextResponse.json({ ok: false, error }, { status: 400 });

/** Add (or update the note of) a behavior tag on a local day. */
export async function POST(req: NextRequest) {
  const parsed = addBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid tag payload.");
  const { day, tag, note } = parsed.data;

  await db
    .insert(dayTags)
    .values({ day, tag, note: note || null })
    .onConflictDoUpdate({
      target: [dayTags.day, dayTags.tag],
      set: { note: note || null },
    });

  return NextResponse.json({ ok: true });
}

/** Remove a behavior tag from a local day. */
export async function DELETE(req: NextRequest) {
  const parsed = removeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid tag payload.");
  const { day, tag } = parsed.data;

  await db
    .delete(dayTags)
    .where(and(eq(dayTags.day, day), eq(dayTags.tag, tag)));

  return NextResponse.json({ ok: true });
}
