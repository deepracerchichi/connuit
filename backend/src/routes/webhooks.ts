import { Router } from "express";
import { WorkflowModel } from "../model/workflowSchema.js";
import { AppError } from "../errors/AppError.js";
import { runQueue } from "../queue/runQueue.js";
import { env } from "../config/env.js";
import { telegramSecretMatches } from "../services/telegramService.js";

export const webhooksRouter = Router();

// Telegram calls this when someone messages a bot that starts a workflow (registered on save,
// see services/telegramService.ts). Declared above /:token so it isn't swallowed by it.
webhooksRouter.post("/telegram/:token", async (req, res) => {
  if (!env.TELEGRAM_WEBHOOK_SECRET) throw new AppError("Telegram webhook not configured", 503);
  // The header is this workflow's own secret, which only we and Telegram know: it proves the call is real.
  if (!telegramSecretMatches(req.params.token, req.header("x-telegram-bot-api-secret-token"))) {
    throw new AppError("Forbidden", 403);
  }

  // Gone (deleted, or no longer Telegram-triggered): answer 200 anyway, or Telegram keeps retrying it.
  const workflow = await WorkflowModel.findOne({ webhookToken: req.params.token, "trigger.type": "telegram" });
  if (!workflow) return res.status(200).json({ ignored: true });

  // Only text messages start a run. Anything else gets a 200 so Telegram doesn't keep retrying it.
  const message = req.body?.message ?? req.body?.channel_post;
  if (typeof message?.text !== "string") return res.status(200).json({ ignored: true });

  const runId = crypto.randomUUID();
  await runQueue.add("run", {
    workflowId: workflow.id,
    userId: workflow.userId,
    runId,
    input: {
      text: message.text,
      chatId: String(message.chat.id),
      from: message.from?.username ?? message.from?.first_name,
    },
  });
  return res.status(200).json({ message: "Run queued", runId });
});

// Any other app calling a webhook-triggered workflow's private URL.
webhooksRouter.post("/:token", async (req, res) => {
  const workflow = await WorkflowModel.findOne({ webhookToken: req.params.token, "trigger.type": "webhook" });
  if (!workflow) {
    throw new AppError("Webhook not found", 404);
  }

  const runId = crypto.randomUUID();
  await runQueue.add("run", { workflowId: workflow.id, userId: workflow.userId, runId, input: req.body });
  return res.status(202).json({ message: "Run queued", runId });
});
