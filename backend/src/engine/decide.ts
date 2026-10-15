import { callLlm } from "./llm.js";

// Asks the AI a yes/no question about some data, and turns its reply into an exact "yes" or "no".
export async function decide(question: string, data: unknown): Promise<"yes" | "no"> {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const reply = await callLlm(
    `Question: ${question}\n\nData:\n${text ?? "(nothing)"}`,
    "You answer yes/no questions about data. Reply with exactly one word: yes or no. No punctuation, no explanation.",
  );

  // Accept only a reply that starts with the word yes or no ("Yes.", "no" — fine; "maybe" — not).
  const word = reply.trim().toLowerCase().match(/^(yes|no)\b/)?.[1];
  if (!word) {
    throw new Error(`The AI didn't answer yes or no (it said: "${reply.slice(0, 80)}").`);
  }
  return word as "yes" | "no";
}
