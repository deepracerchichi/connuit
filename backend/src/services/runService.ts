import { UnrecoverableError } from "bullmq";
import type { Workflow } from "../domain/workflow.js";
import { WorkflowModel } from "../model/workflowSchema.js";
import { RunModel } from "../model/runSchema.js";
import { AppError } from "../errors/AppError.js";
import { runWorkflow } from "../engine/runWorkflow.js";
import { CredentialModel } from "../model/credentialSchema.js";
import { decrypt } from "../crypto/encryption.js";

export async function triggerRun(userId: string, workflowId: string, runId: string, input?: unknown) {
  const doc = await WorkflowModel.findOne({ _id: workflowId, userId });
  if (!doc) {
    throw new AppError("Workflow not found", 404);
  }

  const workflow: Workflow = {
    id: doc.id, userId: doc.userId, name: doc.name,
    nodes: doc.nodes, edges: doc.edges,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    trigger: doc.trigger,
  };

  // Upsert, not create — a retry reuses this same runId and must update
  // the same document, not collide trying to insert a duplicate.
  const credentialValues = await resolveCredentials(workflow, userId);
  await RunModel.findByIdAndUpdate(
    runId,
    { workflowId: workflow.id, status: "running", steps: [], final: false },
    { upsert: true }
  );

  const run = await runWorkflow(workflow, runId, credentialValues, input);

    await RunModel.findByIdAndUpdate(runId, { status: run.status, steps: run.steps, final: run.retryable === false });

  // Throwing is how BullMQ knows this attempt failed: it retries with backoff,
  // and after the last attempt the worker's "failed" handler marks the run failed.
  // The failed step is already saved above, so the dashboard can show what broke.
  // UnrecoverableError skips the retries when they can't help (e.g. the daily AI limit).
  if (run.status === "failed") {
    const failedStep = run.steps.find((step) => step.status === "failed");
    const message = failedStep?.error ?? "Workflow run failed";
    throw run.retryable === false ? new UnrecoverableError(message) : new Error(message);
  }

  return run;

}

async function resolveCredentials(workflow: Workflow, userId: string): Promise<Map<string, string>> {
  const credentialValues = new Map<string, string>();

  for (const node of workflow.nodes) {
    const credentialId =
      node.config.type === "http_request" || node.config.type === "telegram_message" || node.config.type === "gmail_send"
        ? node.config.credentialId
        : undefined;
    if (!credentialId || credentialValues.has(credentialId)) continue;

    const credential = await CredentialModel.findOne({ _id: credentialId, userId });
    if (!credential) {
      throw new AppError(`Credential not found: ${credentialId}`, 404);
    }

    credentialValues.set(credentialId, decrypt(credential.encryptedValue));
  }

  return credentialValues;
}



