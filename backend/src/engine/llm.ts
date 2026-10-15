import { env } from "../config/env.js";

// Gemini's OpenAI-compatible endpoint (free tier). To switch providers later,
// only this file and .env change.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Cost and safety guardrails: every AI step is capped on both sides.
const MAX_PROMPT_CHARS = 20_000; // about 5,000 tokens of input
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 30_000;

interface ChatCompletion {
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// Gemini's free tier allows 15 requests/minute for this model. Stay safely under it:
// calls beyond the limit wait for a slot instead of failing with 429.
const MAX_CALLS_PER_MINUTE = 12;
const recentCalls: number[] = [];

async function waitForSlot() {
  for (;;) {
    const now = Date.now();
    while (recentCalls.length > 0 && now - recentCalls[0] > 60_000) recentCalls.shift();
    if (recentCalls.length < MAX_CALLS_PER_MINUTE) {
      recentCalls.push(now);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000 - (now - recentCalls[0]) + 50));
  }
}


export async function callLlm(prompt: string, systemPrompt?: string): Promise<string> {
  // Oversized input is cut, and the AI is told so (never silently).
    await waitForSlot();
  const safePrompt =
    prompt.length > MAX_PROMPT_CHARS
      ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n\n[Input cut off: ${prompt.length - MAX_PROMPT_CHARS} more characters were not sent.]`
      : prompt;

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: safePrompt },
  ];

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.LLM_MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS), // a stuck request can't hang the run forever
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Gemini sometimes wraps errors in an array, sometimes not.
    const detail = Array.isArray(data) ? data[0]?.error?.message : data?.error?.message;
    throw new Error(`AI request failed (${response.status}): ${detail ?? response.statusText}`);
  }

  const result = data as ChatCompletion;
  console.log(`[llm] ${result.model}: ${result.usage?.prompt_tokens ?? "?"} in / ${result.usage?.completion_tokens ?? "?"} out`);

  const text = result.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("The AI returned no text.");
  return text;
}
