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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
