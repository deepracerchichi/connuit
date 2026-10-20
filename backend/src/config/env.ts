import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  MONGODB_URI: z.string().url(),
  PORT: z.coerce.number().int().positive().default(5000),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.url(),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-f]+$/i),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  GEMINI_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gemini-3.5-flash-lite"),
  AI_CALLS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(50),
  AI_CALLS_PER_DAY_TOTAL: z.coerce.number().int().positive().default(450), // stays under Gemini's free daily limit
    TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
