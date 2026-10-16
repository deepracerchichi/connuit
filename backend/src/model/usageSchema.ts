import mongoose from "mongoose";

// One document per user per day (UTC): how many AI calls they've made.
// The whole app's total is counted the same way, under the userId "platform".
const usageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true }, // e.g. "2026-10-16", in UTC
  // No default on purpose: the counter is created by an upsert's $inc, and a default
  // would make Mongoose also set it on insert, which MongoDB rejects as a conflict.
  aiCalls: { type: Number, required: true },
});

// Exactly one counter per user per day. The limit check relies on this (see usageService).
usageSchema.index({ userId: 1, day: 1 }, { unique: true });

export const UsageModel = mongoose.model("Usage", usageSchema);
