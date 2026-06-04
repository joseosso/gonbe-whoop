import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { exchangeCode } from "@/lib/whoop/oauth";

export const runtime = "nodejs";

/** OAuth redirect target: verify state, exchange the code, store tokens. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const jar = await cookies();
  const expected = jar.get("whoop_oauth_state")?.value;
  jar.delete("whoop_oauth_state");

  if (!code || !state || state !== expected) {
    return NextResponse.redirect(new URL("/?error=oauth", req.url));
  }

  try {
    await exchangeCode(code);
  } catch {
    return NextResponse.redirect(new URL("/?error=token", req.url));
  }

  return NextResponse.redirect(new URL("/?connected=1", req.url));
}
