import { Worker } from "bullmq";
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
  }
);



runWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed permanently after ${job?.attemptsMade} attempts:`, error.message);

  if (job) {
    RunModel.findByIdAndUpdate(job.data.runId, { status: "failed" }).catch((updateError) => {
      console.error(`Failed to mark run ${job.data.runId} as failed:`, updateError);
    });
  }
});
