import { Router } from "express";
import { WorkflowModel } from "../model/workflowSchema.js";
import { createWorkflowSchema } from "../validation/workflow.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { AppError } from "../errors/AppError.js";

import { RunModel } from "../model/runSchema.js";

import { runQueue } from "../queue/runQueue.js";
import { scheduleCronWorkflow, unscheduleCronWorkflow } from "../scheduler/cronScheduler.js";
import { registerTelegramWebhook, unregisterTelegramWebhook } from "../services/telegramService.js";
import type { Trigger } from "../domain/workflow.js";



export const workflowsRouter = Router();

// A trigger's saved example data (validated as JSON when saved), or nothing.
function sampleInput(trigger: Trigger): unknown {
  if ((trigger.type !== "webhook" && trigger.type !== "telegram") || !trigger.sample) return undefined;
  return JSON.parse(trigger.sample);
}

// Webhook and Telegram triggers are both reached through a URL with the workflow's own token.
const needsWebhookToken = (trigger: Trigger) => trigger.type === "webhook" || trigger.type === "telegram";

// Telegram gives each bot one webhook, so one bot can start one workflow. Saying so beats
// silently pointing the bot away from the workflow that had it.
async function assertBotIsFree(userId: string, credentialId: string, exceptWorkflowId?: string) {
  const other = await WorkflowModel.findOne({
    userId,
    "trigger.type": "telegram",
    "trigger.credentialId": credentialId,
    ...(exceptWorkflowId ? { _id: { $ne: exceptWorkflowId } } : {}),
  });
  if (other) {
    throw new AppError(`That bot already starts “${other.name}”. A Telegram bot can start one workflow: pick another bot, or change that workflow first.`, 409);
  }
}
workflowsRouter.use(requireAuth);
workflowsRouter.post("/", async (req, res) => {
  // 1. Authenticate — TODO: real JWT auth (milestone 3b)
  const userId = req.userId!; //guranteed by requireUser middleware
 

  // 2. Validate
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    // Lead with the first specific problem (e.g. "This workflow has a loop…") rather than a generic message.
    const message = parsed.error.issues[0]?.message ?? "Invalid workflow";
    return res.status(400).json({ error: { message, details: parsed.error.flatten() } });
  }

  
// 3. Act
const trigger = parsed.data.trigger;
const webhookToken = needsWebhookToken(trigger) ? crypto.randomUUID() : undefined;
// Point the bot at this workflow before saving, so a bad token or unset server config fails the save.
if (trigger.type === "telegram") {
  await assertBotIsFree(userId, trigger.credentialId);
  await registerTelegramWebhook(userId, trigger.credentialId, webhookToken!);
}
const workflow = await WorkflowModel.create({ userId, ...parsed.data, webhookToken });

if (workflow.trigger.type === "cron") {
  scheduleCronWorkflow(workflow.id, workflow.userId, workflow.trigger.schedule);
}
  // 4. Respond
  return res.status(201).json(workflow);
});

// GET /workflows — list the current user's workflows
workflowsRouter.get("/", async (req, res) => {
  const userId = req.userId!;
  const workflows = await WorkflowModel.find({ userId }).sort({ createdAt: -1 });
  return res.json(workflows);
});

// GET /workflows/:id — one workflow, only if this user owns it
workflowsRouter.get("/:id", async (req, res) => {
  const userId = req.userId!;
  const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }
  return res.json(workflow);
});

// POST /workflows/:id/runs — execute a workflow now
workflowsRouter.post("/:id/runs", async (req, res) => {
  const userId = req.userId!;
  const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  // Running by hand a workflow that something else normally starts: use the input sent with the
  // request, or else the trigger's saved sample, so {{trigger…}} and the first step have data.
  const input = req.body?.input ?? sampleInput(workflow.trigger as Trigger);
  const runId = crypto.randomUUID();
  await runQueue.add("run", { workflowId: workflow.id, userId, runId, input });
  return res.status(202).json({ message: "Run queued", runId });

});

// GET /workflows/:id/runs — list every run for this workflow
workflowsRouter.get("/:id/runs", async (req, res) => {
  const userId = req.userId!;
  const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  const runs = await RunModel.find({ workflowId: workflow.id }).sort({ createdAt: -1 });
  return res.json(runs);
});

// GET /workflows/:id/runs/:runId — one run's full detail
workflowsRouter.get("/:id/runs/:runId", async (req, res) => {
  const userId = req.userId!;
  const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  const run = await RunModel.findOne({ _id: req.params.runId, workflowId: workflow.id });
  if (!run) {
    throw new AppError("Run not found", 404);
  }
  return res.json(run);
});

// PUT /workflows/:id — replace a workflow with its edited version
workflowsRouter.put("/:id", async (req, res) => {
  const userId = req.userId!;
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    // Lead with the first specific problem (e.g. "This workflow has a loop…") rather than a generic message.
    const message = parsed.error.issues[0]?.message ?? "Invalid workflow";
    return res.status(400).json({ error: { message, details: parsed.error.flatten() } });
  }

  const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  // Keep the same webhook URL across edits (other apps are already calling it).
  // Only create a token if it just became a webhook; drop it if it stopped being one.
  const before = workflow.trigger as Trigger;
  const after = parsed.data.trigger;
  const webhookToken = needsWebhookToken(after) ? workflow.webhookToken ?? crypto.randomUUID() : undefined;

  // (Re)point the bot at this workflow before saving, so a bad token fails the save, not later runs.
  if (after.type === "telegram") {
    await assertBotIsFree(userId, after.credentialId, workflow.id);
    await registerTelegramWebhook(userId, after.credentialId, webhookToken!);
  }

  workflow.set({ ...parsed.data, webhookToken });
  await workflow.save();

  // A bot that no longer starts this workflow should stop sending us its messages.
  if (before.type === "telegram" && !(after.type === "telegram" && after.credentialId === before.credentialId)) {
    await unregisterTelegramWebhook(userId, before.credentialId);
  }

  // Throw away the old timer, then start a new one if it's (still) a cron workflow.
  unscheduleCronWorkflow(workflow.id);
  if (workflow.trigger.type === "cron") {
    scheduleCronWorkflow(workflow.id, workflow.userId, workflow.trigger.schedule);
  }

  return res.json(workflow);
});

// DELETE /workflows/:id — remove a workflow, its schedule, and its run history
workflowsRouter.delete("/:id", async (req, res) => {
  const userId = req.userId!;
  const workflow = await WorkflowModel.findOneAndDelete({ _id: req.params.id, userId });
  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  unscheduleCronWorkflow(workflow.id);
  const trigger = workflow.trigger as Trigger;
  if (trigger.type === "telegram") await unregisterTelegramWebhook(userId, trigger.credentialId);
  await RunModel.deleteMany({ workflowId: workflow.id });
  return res.status(204).send();
});


