import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env, publicApiUrl } from "../config/env.js";

// Gmail through Google OAuth. A user connects once ("Allow" on Google's screen); we keep their
// refresh token, encrypted, as a "Google" credential, and the Send Gmail step trades it for a
// short-lived access token each time it runs. We only ever ask to *send* (gmail.send):
// Google classes reading mail as "restricted", which needs a paid security assessment.

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SCOPES = ["openid", "email", GMAIL_SEND_SCOPE];

export const googleConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// Must match a redirect URI registered on the Google OAuth client exactly.
export const googleRedirectUri = () => `${publicApiUrl ?? `http://localhost:${env.PORT}`}/oauth/google/callback`;

/* ---------- Connecting ---------- */

// The OAuth "state" goes out through the browser and comes back on the callback: it says which
// user is connecting and proves the callback answers a request we started (no forged callbacks).
// It's signed with a key derived from JWT_SECRET, never JWT_SECRET itself, so a state value seen
// in a URL can't be used as a login token.
const stateKey = () => createHash("sha256").update(`${env.JWT_SECRET}:google-oauth-state`).digest("hex");

export function googleAuthUrl(userId: string): string {
  const state = jwt.sign({ sub: userId }, stateKey(), { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token, so steps can send while the user is away
    prompt: "consent", // and get a new one even when reconnecting the same account
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// The user a callback belongs to, or null if the state is forged, tampered with or older than 10 minutes.
export function userFromState(state: string): string | null {
  try {
    return (jwt.verify(state, stateKey()) as { sub: string }).sub;
  } catch {
    return null;
  }
}

type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(fields: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...fields }),
  });
  const body = ((await response.json().catch(() => null)) ?? {}) as TokenResponse;
  return { ok: response.ok, body };
}

// Swaps the code from the callback for tokens, and reads which account and permissions were granted.
export async function exchangeCode(code: string) {
  const { ok, body } = await tokenRequest({ code, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" });
  if (!ok || !body.refresh_token) throw new Error(`Google: ${body.error_description ?? body.error ?? "no refresh token returned"}`);
  // The id_token came straight from Google's token endpoint over HTTPS, so reading its claims is safe.
  const payload = (body.id_token ?? "").split(".")[1] ?? "";
  const claims = (payload ? JSON.parse(Buffer.from(payload, "base64url").toString()) : {}) as { email?: string };
  return { refreshToken: body.refresh_token, email: claims.email ?? "unknown account", scopes: (body.scope ?? "").split(" ") };
}

/* ---------- Sending ---------- */

async function accessToken(refreshToken: string): Promise<string> {
  const { ok, body } = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (ok && body.access_token) return body.access_token;
  if (body.error === "invalid_grant") {
    throw new Error(
      "Gmail: the connection expired or was revoked. Reconnect Gmail under Credentials (while Conduit's Google app is in testing, connections last 7 days).",
    );
  }
  throw new Error(`Gmail: ${body.error_description ?? body.error ?? "couldn't get access"}`);
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// A plain-text email in the format Gmail's API takes (RFC 2822, base64url). Header values are
// flattened to one line, so text from a webhook can't smuggle in extra headers (Bcc: …).
export function buildMessage({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const recipients = oneLine(to)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error("Gmail: there's no one to send to.");
  for (const address of recipients) {
    if (!EMAIL.test(address)) throw new Error(`Gmail: “${address}” isn't an email address.`);
  }
  const title = oneLine(subject);
  const encodedTitle = /^[\x20-\x7e]*$/.test(title) ? title : `=?UTF-8?B?${Buffer.from(title).toString("base64")}?=`; // non-ASCII subjects
  const message = [
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodedTitle}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

// Sends as the connected account. `credentialValue` is the decrypted credential: { refreshToken, email }.
export async function sendGmail(credentialValue: string, mail: { to: string; subject: string; body: string }) {
  const { refreshToken } = JSON.parse(credentialValue) as { refreshToken: string };
  const raw = buildMessage(mail); // check the addresses before using up a token request
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(refreshToken)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const result = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(`Gmail: ${result?.error?.message ?? `sending failed (${response.status})`}`);
  return { messageId: result?.id, to: mail.to };
}
