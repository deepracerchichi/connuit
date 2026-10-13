// Shapes of what the backend sends. Mongo documents arrive with "_id";
// the credentials route builds its own objects, so those use "id".

export type Trigger = { type: "manual" } | { type: "webhook" } | { type: "cron"; schedule: string };

export type NodeConfig =
  | { type: "http_request"; url: string; method: "GET" | "POST" | "PUT" | "DELETE"; credentialId?: string }
  | { type: "llm_call"; prompt: string; systemPrompt?: string };

export interface WorkflowNode {
  id: string;
  name: string;
  config: NodeConfig;
}

export interface Workflow {
  _id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: { from: string; to: string }[];
  trigger: Trigger;
  webhookToken?: string;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "pending" | "running" | "succeeded" | "failed";

export interface RunStep {
  nodeId: string;
  status: RunStatus;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  attempt: number;
}

export interface Run {
  _id: string;
  workflowId: string;
  status: RunStatus;
  steps: RunStep[];
  createdAt: string;
  updatedAt: string;
}

export type RunWithWorkflow = Run & { workflowName: string };

export interface Credential {
  id: string;
  name: string;
  provider: string;
  createdAt: string;
}
