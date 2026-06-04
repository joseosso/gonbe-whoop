import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildAuthUrl } from "@/lib/whoop/oauth";

export const runtime = "nodejs";

/** Start the WHOOP OAuth flow: set a CSRF state cookie, redirect to WHOOP. */
export async function GET() {
  const state = randomBytes(16).toString("hex");

  const jar = await cookies();
  jar.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
