// Shapes of what the backend sends. Mongo documents arrive with "_id";
// the credentials route builds its own objects, so those use "id".

export type Trigger =
  | { type: "manual" }
  | { type: "webhook"; sample?: string } // sample: JSON test runs use in place of a real call
  | { type: "cron"; schedule: string }
  | { type: "telegram"; credentialId: string; sample?: string }; // a message to this bot starts a run (its token is the credential)

export type NodeConfig =
  | {
      type: "http_request";
      url: string;
      method: "GET" | "POST" | "PUT" | "DELETE";
      headers?: Record<string, string>;
      body?: unknown;
      credentialId?: string;
    }
  | { type: "llm_call"; prompt: string; systemPrompt?: string }
  | { type: "condition"; question: string } // an If step: the AI answers yes or no
  | { type: "telegram_message"; credentialId: string; chatId: string; text: string }; // credential = the bot token

export type Branch = "yes" | "no";

export interface WorkflowEdge {
  from: string;
  to: string;
  branch?: Branch; // only on connections leaving an If step: which answer takes this path
}

export interface WorkflowNode {
  id: string;
  name: string;
  config: NodeConfig;
}

export interface Workflow {
  _id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trigger: Trigger;
  webhookToken?: string;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "pending" | "running" | "succeeded" | "failed";

// "skipped": the step was on a path an If step didn't take.
export type StepStatus = RunStatus | "skipped";

export interface RunStep {
  nodeId: string;
  status: StepStatus;
  decision?: Branch; // what an If step answered
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
  final?: boolean; // a failed run that won't be retried (last attempt, or the daily AI limit)
  createdAt: string;
  updatedAt: string;
}

export type RunWithWorkflow = Run & { workflowName: string };

// GET /usage: today's AI calls (AI steps and If steps) against the daily allowance.
export interface Usage {
  aiCalls: number;
  limit: number;
  resetsAt: string; // next midnight UTC
}

export interface Credential {
  id: string;
  name: string;
  provider: string;
  createdAt: string;
}
