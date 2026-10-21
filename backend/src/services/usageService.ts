import { env } from "../config/env.js";
import { UsageModel } from "../model/usageSchema.js";

// Daily AI allowances. Every AI call (an AI step, or an If step's decision) reserves one
// before it runs, against two counters: the user's own, and the whole app's, which keeps
// everyone together under the Gemini free tier's daily limit.

const PLATFORM = "platform";

// Thrown when a counter is full. The engine fails the step with this message, and the run
// isn't retried: trying again before midnight UTC would only fail the same way.
export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageLimitError";
  }
}

const today = () => new Date().toISOString().slice(0, 10); // "2026-10-16", UTC

// Next midnight UTC, when every counter starts again.
export function resetsAt(): Date {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function hoursUntilReset() {
  const hours = Math.ceil((resetsAt().getTime() - Date.now()) / 3_600_000);
  return hours <= 1 ? "within the hour" : `in ${hours} hours`;
}

const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

// Adds one to a counter, but only while it's under `limit`, in a single database operation,
// so two runs finishing at the same moment can't both squeeze past the limit.
//
// How: the filter only matches a counter that's still under the limit. If there's none (a full
// one, or none yet today), the upsert tries to create one, and the unique (userId, day) index
// refuses it if one already exists, so "duplicate key" means "full". The one exception is two
// runs creating today's first counter at the same moment: one of them gets a duplicate key
// with room to spare, and simply trying once more succeeds.
async function take(userId: string, day: string, limit: number): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await UsageModel.findOneAndUpdate({ userId, day, aiCalls: { $lt: limit } }, { $inc: { aiCalls: 1 } }, { upsert: true });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  return false;
}

export async function reserveAiCall(userId: string): Promise<void> {
  const day = today();

  if (!(await take(userId, day, env.AI_CALLS_PER_USER_PER_DAY))) {
    throw new UsageLimitError(
      `You've used all ${env.AI_CALLS_PER_USER_PER_DAY} of today's AI calls. They reset at midnight UTC (${hoursUntilReset()}).`,
    );
  }

  if (!(await take(PLATFORM, day, env.AI_CALLS_PER_DAY_TOTAL))) {
    // Give the user theirs back: this call never happened.
    await UsageModel.updateOne({ userId, day }, { $inc: { aiCalls: -1 } });
    throw new UsageLimitError(`Connuit has reached its AI limit for today. AI steps work again at midnight UTC (${hoursUntilReset()}).`);
  }
}

export async function getUsage(userId: string) {
  const counter = await UsageModel.findOne({ userId, day: today() });
  return {
    aiCalls: counter?.aiCalls ?? 0,
    limit: env.AI_CALLS_PER_USER_PER_DAY,
    resetsAt: resetsAt().toISOString(),
  };
}
