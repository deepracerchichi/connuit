import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "./connection.js";
import { triggerRun } from "../services/runService.js";
import type { RunJobData } from "./runQueue.js";
import { RunModel } from "../model/runSchema.js";

export const runWorker = new Worker<RunJobData>(
  "workflow-runs",
  async (job) => {
    await triggerRun(job.data.userId, job.data.workflowId, job.data.runId, job.data.input);

  },
  {
    connection: redisConnection,
    concurrency: 5,
    drainDelay: 60,           // idle: poll every 60s, not 5s (measured ~950K → ~86K Redis commands/month)
    stalledInterval: 300_000, // look for crashed jobs every 5 min instead of 30s
  }
);



runWorker.on("failed", (job, error) => {
  if (!job) return;

  // BullMQ fires "failed" on every failed attempt, not just the last one.
  // An UnrecoverableError (e.g. the daily AI limit) is final whatever the attempt count.
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts && !(error instanceof UnrecoverableError)) {
    console.warn(`Job ${job.id}: attempt ${job.attemptsMade}/${maxAttempts} failed, retrying: ${error.message}`);
    return;
  }

  console.error(`Job ${job.id} failed permanently after ${job.attemptsMade} attempts:`, error.message);
  RunModel.findByIdAndUpdate(job.data.runId, { status: "failed", final: true }).catch((updateError) => {
    console.error(`Failed to mark run ${job.data.runId} as failed:`, updateError);
  });
});

