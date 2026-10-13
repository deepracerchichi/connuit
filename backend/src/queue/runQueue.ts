import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export interface RunJobData {
  workflowId: string;
  userId: string;
  runId: string;
  input?: unknown; // webhook payload; undefined for manual and cron runs
}


export const runQueue = new Queue<RunJobData>("workflow-runs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});
