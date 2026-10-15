import type { NodeConfig, Trigger, Workflow, WorkflowNode } from "../../api/types";

// The editor works on a simple ordered list of steps. The API stores nodes plus
// edges, so these helpers convert between the two.

export type StepKind = "http_request" | "llm_call";
export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface HeaderRow {
  key: string;
  value: string;
}

export interface EditorStep {
  id: string;
  name: string;
  kind: StepKind;
  method: Method;
  url: string;
  credentialId: string;
  headers: HeaderRow[];
  body: string; // JSON text, exactly as typed
  prompt: string;
  systemPrompt: string;
}

export interface Draft {
  name: string;
  trigger: Trigger;
  steps: EditorStep[];
}

// The only two placeholders the engine fills in (see backend engine/interpolate.ts).
export const PREVIOUS = "{{previousOutput}}";
export const CREDENTIAL = "{{credential}}";
export const TOKEN_PATTERN = /(\{\{(?:previousOutput|credential)\}\})/;

export const hasBody = (method: Method) => method === "POST" || method === "PUT";

export function makeStep(fields: Partial<EditorStep> & Pick<EditorStep, "kind" | "name">): EditorStep {
  return {
    id: crypto.randomUUID(),
    method: "GET",
    url: "",
    credentialId: "",
    headers: [],
    body: "",
    prompt: "",
    systemPrompt: "",
    ...fields,
  };
}

export function emptyDraft(): Draft {
  return { name: "Untitled workflow", trigger: { type: "manual" }, steps: [] };
}

// Follow the edges from the start node so the editor shows the real run order.
function orderNodes(workflow: Workflow): WorkflowNode[] {
  const hasIncoming = new Set(workflow.edges.map((edge) => edge.to));
  let current = workflow.nodes.find((node) => !hasIncoming.has(node.id));
  const ordered: WorkflowNode[] = [];

  while (current && !ordered.includes(current)) {
    ordered.push(current);
    const next = workflow.edges.find((edge) => edge.from === current!.id);
    current = next ? workflow.nodes.find((node) => node.id === next.to) : undefined;
  }

  return ordered.length === workflow.nodes.length ? ordered : workflow.nodes;
}

export function fromWorkflow(workflow: Workflow): Draft {
  return {
    name: workflow.name,
    trigger: workflow.trigger,
    steps: orderNodes(workflow).map((node) => {
      const config = node.config;
      if (config.type === "llm_call") {
        return makeStep({ id: node.id, kind: "llm_call", name: node.name, prompt: config.prompt, systemPrompt: config.systemPrompt ?? "" });
      }
      return makeStep({
        id: node.id,
        kind: "http_request",
        name: node.name,
        method: config.method,
        url: config.url,
        credentialId: config.credentialId ?? "",
        headers: Object.entries(config.headers ?? {}).map(([key, value]) => ({ key, value })),
        body: config.body === undefined ? "" : JSON.stringify(config.body, null, 2),
      });
    }),
  };
}

// What POST /workflows and PUT /workflows/:id expect. Only call after validate() passed.
export function toPayload(draft: Draft) {
  const nodes: WorkflowNode[] = draft.steps.map((step) => {
    if (step.kind === "llm_call") {
      return {
        id: step.id,
        name: step.name.trim(),
        config: { type: "llm_call", prompt: step.prompt, ...(step.systemPrompt.trim() ? { systemPrompt: step.systemPrompt } : {}) },
      };
    }

    const headers = Object.fromEntries(step.headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]));
    const config: NodeConfig = {
      type: "http_request",
      method: step.method,
      url: step.url.trim(),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(hasBody(step.method) && step.body.trim() ? { body: JSON.parse(step.body) } : {}),
      ...(step.credentialId ? { credentialId: step.credentialId } : {}),
    };
    return { id: step.id, name: step.name.trim(), config };
  });

  // The engine runs one straight line: each step leads to the next.
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }));
  return { name: draft.name.trim(), trigger: draft.trigger, nodes, edges };
}

/* ---------- Validation: catch problems here, with messages a person can act on ---------- */

export interface Problems {
  general: string | null;
  steps: Record<string, string>; // step id -> what's wrong with it
}

function isUrlOrPlaceholder(value: string) {
  if (TOKEN_PATTERN.test(value)) return true; // same rule as the backend
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const usesCredential = (step: EditorStep) =>
  [step.url, step.body, ...step.headers.map((h) => h.value)].some((value) => value.includes(CREDENTIAL));

const nameKey = (name: string) => name.trim().toLowerCase();

// Later steps refer to earlier ones by name ({{steps.Name}}), so a new step gets "Ask AI 2" rather than a second "Ask AI".
export function uniqueName(name: string, steps: EditorStep[]): string {
  const taken = new Set(steps.map((step) => nameKey(step.name)));
  if (!taken.has(nameKey(name))) return name;
  let n = 2;
  while (taken.has(nameKey(`${name} ${n}`))) n++;
  return `${name} ${n}`;
}

export function validate(draft: Draft): Problems | null {
  const steps: Record<string, string> = {};
  const seenNames = new Set<string>();

  for (const step of draft.steps) {
    const duplicate = seenNames.has(nameKey(step.name));
    seenNames.add(nameKey(step.name));

    if (!step.name.trim()) steps[step.id] = "Give this step a name.";
    else if (duplicate) steps[step.id] = "Another step already has this name. Give each step its own.";
    else if (step.kind === "llm_call" && !step.prompt.trim()) steps[step.id] = "Write a prompt for the AI.";
    else if (step.kind === "http_request") {
      if (!isUrlOrPlaceholder(step.url.trim())) steps[step.id] = "Enter a full URL, like https://api.example.com/data.";
      else if (usesCredential(step) && !step.credentialId) steps[step.id] = "Pick a credential: this step uses one.";
      else if (hasBody(step.method) && step.body.trim()) {
        try {
          JSON.parse(step.body);
        } catch {
          steps[step.id] = "The body isn't valid JSON.";
        }
      }
    }
  }

  let general: string | null = null;
  if (!draft.name.trim()) general = "Give your workflow a name.";
  else if (draft.steps.length === 0) general = "Add at least one step.";
  else if (draft.trigger.type === "cron" && !draft.trigger.schedule.trim()) general = "Choose when it should run.";
  else if (Object.keys(steps).length > 0) general = "Some steps need attention.";

  return general || Object.keys(steps).length > 0 ? { general, steps } : null;
}
