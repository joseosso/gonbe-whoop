import { db } from "@/lib/db/client";
import { whoopTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  WHOOP_AUTH_URL,
  WHOOP_SCOPES,
  WHOOP_TOKEN_URL,
} from "./constants";
import { tokenResponse, type TokenResponse } from "./schemas";

const TOKENS_ROW_ID = 1;
// Refresh a little early to avoid using a token that expires mid-request.
const EXPIRY_SKEW_MS = 60_000;

/** Build the WHOOP authorize URL to redirect the user to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.WHOOP_CLIENT_ID,
    redirect_uri: env.WHOOP_REDIRECT_URI,
    response_type: "code",
    scope: WHOOP_SCOPES.join(" "),
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  body.set("client_id", env.WHOOP_CLIENT_ID);
  body.set("client_secret", env.WHOOP_CLIENT_SECRET);

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`WHOOP token request failed (${res.status}): ${await res.text()}`);
  }
  return tokenResponse.parse(await res.json());
}

/** Exchange an authorization code for tokens and persist them. */
export async function exchangeCode(code: string): Promise<void> {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.WHOOP_REDIRECT_URI,
    }),
  );
  await saveTokens(token);
}

async function saveTokens(token: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const values = {
    id: TOKENS_ROW_ID,
    accessToken: token.access_token,
    // WHOOP only returns a refresh_token on the initial grant; reuse if absent.
    refreshToken: token.refresh_token ?? "",
    expiresAt,
    scope: token.scope,
    updatedAt: new Date(),
  };

  await db
    .insert(whoopTokens)
    .values(values)
    .onConflictDoUpdate({
      target: whoopTokens.id,
      set: {
        accessToken: values.accessToken,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        expiresAt: values.expiresAt,
        scope: values.scope,
        updatedAt: values.updatedAt,
      },
    });
}

/** True once the user has connected WHOOP (a token row exists). */
export async function isConnected(): Promise<boolean> {
  const row = await db.query.whoopTokens.findFirst();
  return Boolean(row);
}

/**
 * Return a non-expired access token, refreshing transparently when needed.
 * Throws if WHOOP has not been connected yet.
 */
export async function getValidAccessToken(): Promise<string> {
  const row = await db.query.whoopTokens.findFirst();
  if (!row) throw new Error("WHOOP not connected. Authorize first.");

  if (row.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
    return row.accessToken;
  }

  const token = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      scope: "offline",
    }),
  );
  await saveTokens(token);
  return token.access_token;
}
