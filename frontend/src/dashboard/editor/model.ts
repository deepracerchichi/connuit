import type { Branch, NodeConfig, Trigger, Workflow, WorkflowEdge, WorkflowNode } from "../../api/types";

// The editor works on a list of steps. An If step holds two lists of its own (its Yes and
// No paths), and after it both paths join back into the list it sits in. The API stores
// nodes plus edges, so these helpers convert between the two.

export type StepKind = "http_request" | "llm_call" | "condition";
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
  question: string; // If steps: what the AI answers yes or no to
  yes: EditorStep[]; // If steps: the path taken on "yes" (always empty for other steps)
  no: EditorStep[];
}

export interface Draft {
  name: string;
  trigger: Trigger;
  steps: EditorStep[];
}

/* ---------- Placeholders the engine fills in (see backend engine/interpolate.ts) ---------- */

export const PREVIOUS = "{{previousOutput}}";
export const CREDENTIAL = "{{credential}}";
export const stepToken = (name: string) => `{{steps.${name.trim()}}}`;
// One whole placeholder, e.g. {{previousOutput}}, {{previousOutput.items[0]}}, {{steps.Get news.title}}.
export const TOKEN_PATTERN = /(\{\{\s*(?:previousOutput(?:[.[][^{}]*)?|credential|steps\.[^{}]+?)\s*\}\})/;

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
    question: "",
    yes: [],
    no: [],
    ...fields,
  };
}

export function emptyDraft(): Draft {
  return { name: "Untitled workflow", trigger: { type: "manual" }, steps: [] };
}

/* ---------- Finding your way around the tree ---------- */

// A place in the tree: which list, and a position in it. Lists are "root" (the main line)
// or an If step's path, e.g. "<if step id>:yes".
export const ROOT = "root";
export const pathKey = (ifId: string, branch: Branch) => `${ifId}:${branch}`;

export interface Slot {
  list: string;
  index: number;
}

export const sameSlot = (a: Slot | null, b: Slot) => a !== null && a.list === b.list && a.index === b.index;

// Every step, the ones on If paths included, in reading order.
export function allSteps(steps: EditorStep[]): EditorStep[] {
  return steps.flatMap((step) => [step, ...allSteps(step.yes), ...allSteps(step.no)]);
}

export const findStep = (steps: EditorStep[], id: string) => allSteps(steps).find((step) => step.id === id);

// Where a step sits: its list and its position in it.
export function locate(steps: EditorStep[], id: string, list = ROOT): Slot | null {
  for (const [index, step] of steps.entries()) {
    if (step.id === id) return { list, index };
    const inside = locate(step.yes, id, pathKey(step.id, "yes")) ?? locate(step.no, id, pathKey(step.id, "no"));
    if (inside) return inside;
  }
  return null;
}

// Rewrites one list, wherever it sits in the tree.
export function changeList(steps: EditorStep[], list: string, change: (list: EditorStep[]) => EditorStep[]): EditorStep[] {
  const walk = (current: EditorStep[], key: string): EditorStep[] =>
    (key === list ? change(current) : current).map((step) =>
      step.kind === "condition" ? { ...step, yes: walk(step.yes, pathKey(step.id, "yes")), no: walk(step.no, pathKey(step.id, "no")) } : step,
    );
  return walk(steps, ROOT);
}

export function changeStep(steps: EditorStep[], id: string, patch: Partial<EditorStep>): EditorStep[] {
  return steps.map((step) =>
    step.id === id ? { ...step, ...patch } : step.kind === "condition" ? { ...step, yes: changeStep(step.yes, id, patch), no: changeStep(step.no, id, patch) } : step,
  );
}

// Steps that are sure to have run before this one, so it can use their output by name.
// Steps on an If's paths might not run, so after the If only the If itself counts.
export function earlierSteps(steps: EditorStep[], id: string): EditorStep[] {
  const walk = (list: EditorStep[], before: EditorStep[]): EditorStep[] | null => {
    const seen = [...before];
    for (const step of list) {
      if (step.id === id) return seen;
      const inside = walk(step.yes, [...seen, step]) ?? walk(step.no, [...seen, step]);
      if (inside) return inside;
      seen.push(step);
    }
    return null;
  };
  return walk(steps, []) ?? [];
}

/* ---------- From the API's nodes and edges ---------- */

function toStep(node: WorkflowNode): EditorStep {
  const config = node.config;
  if (config.type === "llm_call") {
    return makeStep({ id: node.id, kind: "llm_call", name: node.name, prompt: config.prompt, systemPrompt: config.systemPrompt ?? "" });
  }
  if (config.type === "condition") {
    return makeStep({ id: node.id, kind: "condition", name: node.name, question: config.question });
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
}

// Rebuilds the step tree from a saved graph. Returns null for shapes the editor can't show
// (e.g. steps running side by side without an If, built through the API), rather than
// showing something that would save back differently.
export function fromWorkflow(workflow: Workflow): Draft | null {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outgoing = (id: string) => workflow.edges.filter((edge) => edge.from === id);

  const reachable = (start: string) => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...outgoing(id).map((edge) => edge.to));
    }
    return seen;
  };

  // Where an If's two paths meet again: the first step both of them lead to.
  const joinOf = (yesStart?: string, noStart?: string): string | undefined => {
    if (!yesStart || !noStart) return undefined;
    const fromNo = reachable(noStart);
    const common = [...reachable(yesStart)].filter((id) => fromNo.has(id));
    return common.find((candidate) => {
      const after = reachable(candidate);
      return common.every((id) => after.has(id));
    });
  };

  const placed = new Set<string>();
  const sequence = (start: string | undefined, stop: string | undefined): EditorStep[] | null => {
    const list: EditorStep[] = [];
    let current = start;
    while (current !== undefined && current !== stop) {
      const node = nodes.get(current);
      if (!node || placed.has(current)) return null; // broken, or reached twice
      placed.add(current);
      const edges = outgoing(current);

      if (node.config.type === "condition") {
        const yesStart = edges.find((edge) => edge.branch === "yes")?.to;
        const noStart = edges.find((edge) => edge.branch === "no")?.to;
        const join = joinOf(yesStart, noStart);
        const yes = sequence(yesStart === join ? undefined : yesStart, join);
        const no = sequence(noStart === join ? undefined : noStart, join);
        if (!yes || !no) return null;
        list.push({ ...toStep(node), yes, no });
        current = join;
      } else {
        if (edges.length > 1) return null; // side-by-side steps: not something the editor draws yet
        list.push(toStep(node));
        current = edges[0]?.to;
      }
    }
    return list;
  };

  const hasIncoming = new Set(workflow.edges.map((edge) => edge.to));
  const starts = workflow.nodes.filter((node) => !hasIncoming.has(node.id));
  if (starts.length !== 1) return null;

  const steps = sequence(starts[0].id, undefined);
  if (!steps || placed.size !== workflow.nodes.length) return null;

  // Only accept it if saving it again would produce exactly the same connections.
  const draft: Draft = { name: workflow.name, trigger: workflow.trigger, steps };
  const key = (edge: WorkflowEdge) => `${edge.from}>${edge.to}>${edge.branch ?? ""}`;
  const original = new Set(workflow.edges.map(key));
  const rebuilt = toPayload(draft).edges.map(key);
  if (rebuilt.length !== original.size || rebuilt.some((edge) => !original.has(edge))) return null;
  return draft;
}

/* ---------- To the API ---------- */

function toNode(step: EditorStep): WorkflowNode {
  const name = step.name.trim();
  if (step.kind === "llm_call") {
    return { id: step.id, name, config: { type: "llm_call", prompt: step.prompt, ...(step.systemPrompt.trim() ? { systemPrompt: step.systemPrompt } : {}) } };
  }
  if (step.kind === "condition") {
    return { id: step.id, name, config: { type: "condition", question: step.question.trim() } };
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
  return { id: step.id, name, config };
}

// The loose ends a list leaves behind: what the next step after it connects from.
type Exit = { from: string; branch?: Branch };

// Connects each step to the loose ends before it. An If leaves the ends of both its paths
// (or itself, labelled, when a path is empty), so the next step joins them back together.
function connect(list: EditorStep[], entries: Exit[], edges: WorkflowEdge[]): Exit[] {
  let exits = entries;
  for (const step of list) {
    for (const exit of exits) edges.push({ from: exit.from, to: step.id, ...(exit.branch ? { branch: exit.branch } : {}) });
    exits =
      step.kind === "condition"
        ? [...connect(step.yes, [{ from: step.id, branch: "yes" }], edges), ...connect(step.no, [{ from: step.id, branch: "no" }], edges)]
        : [{ from: step.id }];
  }
  return exits;
}

// What POST /workflows and PUT /workflows/:id expect. Only call after validate() passed.
export function toPayload(draft: Draft) {
  const edges: WorkflowEdge[] = [];
  connect(draft.steps, [], edges);
  return { name: draft.name.trim(), trigger: draft.trigger, nodes: allSteps(draft.steps).map(toNode), edges };
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
  const taken = new Set(allSteps(steps).map((step) => nameKey(step.name)));
  if (!taken.has(nameKey(name))) return name;
  let n = 2;
  while (taken.has(nameKey(`${name} ${n}`))) n++;
  return `${name} ${n}`;
}

export function validate(draft: Draft): Problems | null {
  const steps: Record<string, string> = {};
  const seenNames = new Set<string>();

  for (const step of allSteps(draft.steps)) {
    const duplicate = seenNames.has(nameKey(step.name));
    seenNames.add(nameKey(step.name));

    if (!step.name.trim()) steps[step.id] = "Give this step a name.";
    else if (duplicate) steps[step.id] = "Another step already has this name. Give each step its own.";
    else if (step.kind === "llm_call" && !step.prompt.trim()) steps[step.id] = "Write a prompt for the AI.";
    else if (step.kind === "condition") {
      if (!step.question.trim()) steps[step.id] = "Write the yes/no question the AI should answer.";
      else if (step.yes.length === 0 && step.no.length === 0) steps[step.id] = "Add a step to the Yes or the No path.";
    } else if (step.kind === "http_request") {
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
