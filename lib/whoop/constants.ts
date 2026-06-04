/** WHOOP API v2 + OAuth endpoints and configuration. */
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

/** Scopes required for full read access + a refresh token (`offline`). */
export const WHOOP_SCOPES = [
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:profile",
  "read:body_measurement",
  "offline",
] as const;

/** Max records per page allowed by the v2 API. */
export const WHOOP_PAGE_LIMIT = 25;
