import { Router } from "express";
import { WorkflowModel } from "../model/workflowSchema.js";
import { AppError } from "../errors/AppError.js";
import { runQueue } from "../queue/runQueue.js";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export const webhooksRouter = Router();
function secretMatches(header: string | undefined) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Telegram calls this when someone messages the bot. The secret header proves it's Telegram.
webhooksRouter.post("/telegram/:token", async (req, res) => {
  if (!env.TELEGRAM_WEBHOOK_SECRET) throw new AppError("Telegram webhook not configured", 503);
  if (!secretMatches(req.header("x-telegram-bot-api-secret-token"))) throw new AppError("Forbidden", 403);

  const workflow = await WorkflowModel.findOne({ webhookToken: req.params.token });
  if (!workflow) throw new AppError("Webhook not found", 404);

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

webhooksRouter.post("/:token", async (req, res) => {
  const workflow = await WorkflowModel.findOne({ webhookToken: req.params.token });
  if (!workflow) {
    throw new AppError("Webhook not found", 404);
  }

  const runId = crypto.randomUUID();
await runQueue.add("run", { workflowId: workflow.id, userId: workflow.userId, runId, input: req.body });
return res.status(202).json({ message: "Run queued", runId });

});
