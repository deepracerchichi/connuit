import { createHmac, timingSafeEqual } from "node:crypto";
import { env, publicApiUrl } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { CredentialModel } from "../model/credentialSchema.js";
import { decrypt } from "../crypto/encryption.js";

// Telegram-triggered workflows. When one is saved, we register its bot's webhook with Telegram
// ourselves, so the bot sends each message to /webhooks/telegram/<this workflow's token>.
//
// Telegram echoes a secret back in the x-telegram-bot-api-secret-token header of every update.
// Each workflow gets its own: an HMAC of its webhook token, keyed with TELEGRAM_WEBHOOK_SECRET.
// The app-wide secret never leaves the server, so nobody (users included) can forge an
// update for a workflow, even one whose webhook token they somehow learned.

export function telegramWebhookSecret(webhookToken: string): string {
  // Hex: 64 characters from Telegram's allowed set (A-Z a-z 0-9 _ -), within its 256 limit.
  return createHmac("sha256", env.TELEGRAM_WEBHOOK_SECRET!).update(webhookToken).digest("hex");
}

export function telegramSecretMatches(webhookToken: string, header: string | undefined): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET || !header) return false;
  const expected = Buffer.from(telegramWebhookSecret(webhookToken));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Both are needed to register a webhook: the signing secret, and a public https URL to give Telegram.
export function telegramTriggersAvailable(): boolean {
  return Boolean(env.TELEGRAM_WEBHOOK_SECRET && publicApiUrl?.startsWith("https://"));
}

async function botToken(userId: string, credentialId: string): Promise<string> {
  const credential = await CredentialModel.findOne({ _id: credentialId, userId });
  if (!credential) throw new AppError("That Telegram bot credential doesn't exist any more. Pick another.", 400);
  return decrypt(credential.encryptedValue);
}

// Calls one Bot API method. Errors carry Telegram's own reason, never the URL (it contains the token).
async function callTelegram(token: string, method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as { ok: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) {
    throw new AppError(`Telegram: ${result?.description ?? `request failed (${response.status})`}`, 400);
  }
}

// Points the bot at this workflow. Replaces whatever webhook the bot had before.
export async function registerTelegramWebhook(userId: string, credentialId: string, webhookToken: string) {
  if (!telegramTriggersAvailable()) {
    throw new AppError("Telegram triggers aren't set up on this server yet (it needs TELEGRAM_WEBHOOK_SECRET and a public https address).", 503);
  }
  const token = await botToken(userId, credentialId);
  await callTelegram(token, "setWebhook", {
    url: `${publicApiUrl}/webhooks/telegram/${webhookToken}`,
    secret_token: telegramWebhookSecret(webhookToken),
    allowed_updates: ["message", "channel_post"],
    drop_pending_updates: true, // don't replay messages sent before this workflow existed
  });
}

// Stops the bot calling us. Best effort: the workflow is going away regardless, so a failure
// (bot deleted, token revoked) is logged rather than blocking the delete or edit.
export async function unregisterTelegramWebhook(userId: string, credentialId: string) {
  try {
    await callTelegram(await botToken(userId, credentialId), "deleteWebhook", {});
  } catch (error) {
    console.warn(`Couldn't remove a Telegram webhook (credential ${credentialId}):`, error instanceof Error ? error.message : error);
  }
}
