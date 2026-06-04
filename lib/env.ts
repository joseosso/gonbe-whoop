import { z } from "zod";

/**
 * Validated environment variables. Import `env` anywhere server-side; it throws
 * at startup if anything required is missing, so the rest of the app can trust it.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WHOOP_CLIENT_ID: z.string().min(1, "WHOOP_CLIENT_ID is required"),
  WHOOP_CLIENT_SECRET: z.string().min(1, "WHOOP_CLIENT_SECRET is required"),
  WHOOP_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3000/api/auth/whoop/callback"),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET,
  WHOOP_REDIRECT_URI: process.env.WHOOP_REDIRECT_URI,
});
