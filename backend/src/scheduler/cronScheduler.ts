import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { runQueue } from "../queue/runQueue.js";
import { WorkflowModel } from "../model/workflowSchema.js";

const scheduledJobs = new Map<string, ScheduledTask>();

export function scheduleCronWorkflow(workflowId: string, userId: string, schedule: string) {
  if (scheduledJobs.has(workflowId)) {
    return; // already scheduled — don't register the same workflow twice
  }

  const task = cron.schedule(schedule, () => {
  const runId = crypto.randomUUID();
  runQueue.add("run", { workflowId, userId, runId }).catch((error) => {
    console.error(`Failed to enqueue cron run for workflow ${workflowId}:`, error);
  });
});



  scheduledJobs.set(workflowId, task);
}



export async function loadCronWorkflowsFromDatabase() {
  const cronWorkflows = await WorkflowModel.find({ "trigger.type": "cron" });
  for (const doc of cronWorkflows) {
    if (doc.trigger.type === "cron") {
      scheduleCronWorkflow(doc.id, doc.userId, doc.trigger.schedule);
    }
  }
}

export function unscheduleCronWorkflow(workflowId: string) {
  scheduledJobs.get(workflowId)?.stop(); // stop the timer, if there is one
  scheduledJobs.delete(workflowId);
}



