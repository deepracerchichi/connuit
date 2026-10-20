import { Router } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { CredentialModel } from "../model/credentialSchema.js";
import { encrypt } from "../crypto/encryption.js";
import { exchangeCode, GMAIL_SEND_SCOPE, googleAuthUrl, googleConfigured, userFromState } from "../services/googleService.js";

export const oauthRouter = Router();

// Step 1: the dashboard asks where to send the user. (A plain link couldn't carry the login token,
// so the dashboard fetches this, then navigates to the URL it gets back.)
oauthRouter.post("/google/start", requireAuth, (req, res) => {
  if (!googleConfigured()) {
    throw new AppError("Gmail isn't set up on this server yet (it needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).", 503);
  }
  res.json({ url: googleAuthUrl(req.userId!) });
});

// Step 2: Google sends the user back here after "Allow" (or "Cancel"). No login header arrives on a
// redirect, so the signed state says who it is. Either way the user lands back on Credentials,
// with ?google=<outcome> for the dashboard to explain.
oauthRouter.get("/google/callback", async (req, res) => {
  const back = (outcome: string) => res.redirect(`${env.FRONTEND_URL}/dashboard/credentials?google=${outcome}`);

  const userId = typeof req.query.state === "string" ? userFromState(req.query.state) : null;
  if (!userId) return back("expired");
  if (req.query.error || typeof req.query.code !== "string") return back("cancelled");

  try {
    const { refreshToken, email, scopes } = await exchangeCode(req.query.code);
    // Google lets people untick permissions on its screen: without "send", the connection is useless.
    if (!scopes.includes(GMAIL_SEND_SCOPE)) return back("no-send-permission");

    // Reconnecting the same account refreshes its credential instead of adding a duplicate.
    await CredentialModel.findOneAndUpdate(
      { userId, provider: "Google", name: `Gmail (${email})` },
      { encryptedValue: encrypt(JSON.stringify({ refreshToken, email })) },
      { upsert: true },
    );
    return back("connected");
  } catch (error) {
    console.warn("Google connect failed:", error instanceof Error ? error.message : error);
    return back("failed");
  }
});
