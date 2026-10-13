import { Router } from "express";
import { WorkflowModel } from "../model/workflowSchema.js";
import { AppError } from "../errors/AppError.js";
import { runQueue } from "../queue/runQueue.js";

export const webhooksRouter = Router();

webhooksRouter.post("/:token", async (req, res) => {
  const workflow = await WorkflowModel.findOne({ webhookToken: req.params.token });
  if (!workflow) {
    throw new AppError("Webhook not found", 404);
  }

  const runId = crypto.randomUUID();
await runQueue.add("run", { workflowId: workflow.id, userId: workflow.userId, runId, input: req.body });
return res.status(202).json({ message: "Run queued", runId });

});
