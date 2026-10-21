import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  MONGODB_URI: z.string().url(),
  PORT: z.coerce.number().int().positive().default(5000),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.url(),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-f]+$/i),
  // CORS compares it exactly against the browser's Origin, which never ends in "/", so drop one if pasted.
  FRONTEND_URL: z.url().default("http://localhost:5173").transform((url) => url.replace(/\/+$/, "")),
  GEMINI_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gemini-3.5-flash-lite"),
  AI_CALLS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(50),
  AI_CALLS_PER_DAY_TOTAL: z.coerce.number().int().positive().default(450), // stays under Gemini's free daily limit
  // Signs each Telegram-triggered workflow's own webhook secret (see services/telegramService.ts). Never leaves the server.
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional(),
  // The API's public https address, for URLs other services call back (Telegram webhooks).
  // On Railway it's worked out from RAILWAY_PUBLIC_DOMAIN, which Railway sets itself.
  PUBLIC_API_URL: z.url().optional(),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  // Google OAuth client (Google Cloud Console → Google Auth Platform → Clients), for the Send Gmail step.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

// Where the outside world reaches this API, without a trailing slash; undefined when unknown (e.g. local dev).
export const publicApiUrl: string | undefined = (
  env.PUBLIC_API_URL ?? (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined)
)?.replace(/\/+$/, "");
