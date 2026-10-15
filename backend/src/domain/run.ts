import type { NodeId } from "./workflow.js";

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";


export interface Step {
  nodeId: NodeId;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;    // absent while running / if it never finished
  attempt: number;      // always 1 for now; the retry milestone increments it
  decision?: "yes" | "no"; // only on If steps: which way it went

}


export type RunStatus = "pending" | "running" | "succeeded" | "failed";

export interface Run {
  id: string;
  workflowId: string;
  status: RunStatus;
  steps: Step[];
}

