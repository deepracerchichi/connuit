export type NodeId = string;

export interface HttpRequestNodeConfig {
  type: "http_request";
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  credentialId?: string;
}

export interface LlmCallNodeConfig {
  type: "llm_call";
  prompt: string;
  systemPrompt?: string;
}

export interface ConditionNodeConfig {
  type: "condition";
  question: string; // a yes/no question about the previous step's output, e.g. "Is anyone upset?"
}

export interface TelegramMessageNodeConfig {
  type: "telegram_message";
  credentialId: string; // a credential holding the bot token from @BotFather
  chatId: string;
  text: string;
}

export type NodeConfig =
  | HttpRequestNodeConfig
  | LlmCallNodeConfig
  | ConditionNodeConfig
  | TelegramMessageNodeConfig;



export interface WorkflowNode {
  id: NodeId;
  name: string;
  config: NodeConfig;
}

export interface WorkflowEdge {
  from: NodeId;
  to: NodeId;
  branch?: "yes" | "no"; // only on edges leaving an If node: which answer follows this connection
}


export interface Workflow {
  id: string;
  userId: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: Date;
  updatedAt: Date;
  trigger: Trigger; 
}

export type Trigger =
  | { type: "manual" }
  | { type: "webhook" }
  | { type: "cron"; schedule: string };


