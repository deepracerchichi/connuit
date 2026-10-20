import type { Branch, NodeConfig, Trigger, Workflow, WorkflowEdge, WorkflowNode } from "../../api/types";

// The editor works on a list of steps. Two kinds of item hold lists of their own:
//   - an If step: a Yes path and a No path; only one of them runs;
//   - a split: several paths that all get the previous step's output and all run.
// After either, the paths join back into the list they sit in, so the next step carries on
// from whichever ran. The API stores nodes plus edges, so these helpers convert between the two.

export type StepKind = "http_request" | "llm_call" | "condition" | "telegram_message" | "split";
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
  chatId: string; // Telegram steps: who gets the message
  text: string; // Telegram steps: the message itself
  yes: EditorStep[]; // If steps: the path taken on "yes" (always empty for other steps)
  no: EditorStep[];
  lanes: EditorStep[][]; // splits: the paths that each get the previous step's output
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
    chatId: "",
    text: "",
    yes: [],
    no: [],
    lanes: [],
    ...fields,
  };
}

export const makeSplit = (lanes: EditorStep[][] = [[], []]) => makeStep({ kind: "split", name: "", lanes });

export function emptyDraft(): Draft {
  return { name: "Untitled workflow", trigger: { type: "manual" }, steps: [] };
}

/* ---------- Finding your way around the tree ---------- */

// A place in the tree: which list, and a position in it. Lists are "root" (the main line) or a
// path: "<if id>:yes", "<if id>:no", or "<split id>:<0, 1, 2…>".
export const ROOT = "root";
export const pathKey = (id: string, path: Branch | number) => `${id}:${path}`;

export interface Slot {
  list: string;
  index: number;
}

export const sameSlot = (a: Slot | null, b: Slot) => a !== null && a.list === b.list && a.index === b.index;

/* ---------- Branches: a step's extra outlets ----------
   In the tree a step's branches are a split right after it: each path of the split is one
   outlet. People never add a split directly; they click a free outlet on a step. */

export const MAX_OUTLETS = 3;

// A list that ends in paths (an If's, or a step's branches). Each path then simply ends; adding
// a step after them would join them, so the editor only does that when asked ("Join paths").
export function endsInFork(list: EditorStep[]) {
  const last = list[list.length - 1];
  return last !== undefined && (last.kind === "condition" || last.kind === "split");
}

// A step has an outlet on top and one underneath: the new branch goes above or below the others.
export type Side = "top" | "bottom";

// Where the step picker goes when it's adding a new branch to a step (not a place in a list).
export const branchSlot = (stepId: string, side: Side = "bottom"): Slot => ({ list: `branch:${side}:${stepId}`, index: 0 });
export function branchTarget(slot: Slot): { stepId: string; side: Side } | null {
  const match = /^branch:(top|bottom):(.+)$/.exec(slot.list);
  return match ? { side: match[1] as Side, stepId: match[2] } : null;
}

// How many steps take this step's output directly.
export function outletCount(list: EditorStep[], index: number) {
  const next = list[index + 1];
  if (next?.kind === "split") return next.lanes.length;
  return next ? 1 : 0;
}

// Ordinary steps (not If steps, which already have Yes/No) with something after them can branch.
// With nothing after, the normal "Add step" already adds what comes next.
export function canBranch(list: EditorStep[], index: number) {
  const step = list[index];
  const outlets = outletCount(list, index);
  return (step.kind === "http_request" || step.kind === "llm_call" || step.kind === "telegram_message") && outlets >= 1 && outlets < MAX_OUTLETS;
}

// Adds `step` as a new branch of the step at `index`, above or below the existing ones. The
// steps that were after it become a branch of their own, so nothing about them changes.
export function addBranch(list: EditorStep[], index: number, step: EditorStep, side: Side = "bottom"): EditorStep[] {
  const place = (lanes: EditorStep[][]) => (side === "top" ? [[step], ...lanes] : [...lanes, [step]]);
  const next = list[index + 1];
  if (next?.kind === "split") {
    return list.map((item, i) => (i === index + 1 ? { ...item, lanes: place(item.lanes) } : item));
  }
  return [...list.slice(0, index + 1), makeSplit(place([list.slice(index + 1)]))];
}

// After something's removed from a branch: drop branches left empty, and turn a split down to
// one branch back into a plain line. Applies to the split owning `list` (a path key), if any.
export function tidyBranches(steps: EditorStep[], list: string): EditorStep[] {
  const splitId = list.slice(0, list.lastIndexOf(":"));
  const split = findStep(steps, splitId);
  if (!split || split.kind !== "split") return steps;
  const lanes = split.lanes.filter((lane) => lane.length > 0);
  const at = locate(steps, splitId)!;
  return changeList(steps, at.list, (items) =>
    items.flatMap((item) => (item.id !== splitId ? [item] : lanes.length <= 1 ? (lanes[0] ?? []) : [{ ...item, lanes }])),
  );
}

// Steps move with their branches, and a split never moves on its own, so a step's branches
// always stay right behind it. Returns the list with the step's group swapped one place along.
export function moveWithBranches(list: EditorStep[], id: string, direction: -1 | 1): EditorStep[] {
  const groups: EditorStep[][] = [];
  for (const item of list) {
    if (item.kind === "split" && groups.length > 0) groups[groups.length - 1].push(item);
    else groups.push([item]);
  }
  const at = groups.findIndex((group) => group[0].id === id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= groups.length) return list;
  [groups[at], groups[to]] = [groups[to], groups[at]];
  return groups.flat();
}

// Whether a step can move up/down (left/right) within its list, counting a step and its branches as one.
export function movable(list: EditorStep[], index: number) {
  const isStep = (item: EditorStep) => item.kind !== "split";
  return { back: list.slice(0, index).some(isStep), forward: list.slice(index + 1).some(isStep) };
}

// The lists an item holds, with their keys (none for ordinary steps).
export function paths(step: EditorStep): { key: string; list: EditorStep[] }[] {
  if (step.kind === "condition") return [{ key: pathKey(step.id, "yes"), list: step.yes }, { key: pathKey(step.id, "no"), list: step.no }];
  if (step.kind === "split") return step.lanes.map((list, i) => ({ key: pathKey(step.id, i), list }));
  return [];
}

// The same item with each of its lists replaced.
function withPaths(step: EditorStep, change: (list: EditorStep[], key: string) => EditorStep[]): EditorStep {
  if (step.kind === "condition") return { ...step, yes: change(step.yes, pathKey(step.id, "yes")), no: change(step.no, pathKey(step.id, "no")) };
  if (step.kind === "split") return { ...step, lanes: step.lanes.map((list, i) => change(list, pathKey(step.id, i))) };
  return step;
}

// Every item, the ones on paths included, in reading order (splits too).
export function allSteps(steps: EditorStep[]): EditorStep[] {
  return steps.flatMap((step) => [step, ...paths(step).flatMap((path) => allSteps(path.list))]);
}

// Only the real steps: the ones that become nodes (a split is just how they're connected).
export const runnable = (steps: EditorStep[]) => allSteps(steps).filter((step) => step.kind !== "split");

export const findStep = (steps: EditorStep[], id: string) => allSteps(steps).find((step) => step.id === id);

// Where an item sits: its list and its position in it.
export function locate(steps: EditorStep[], id: string, list = ROOT): Slot | null {
  for (const [index, step] of steps.entries()) {
    if (step.id === id) return { list, index };
    for (const path of paths(step)) {
      const inside = locate(path.list, id, path.key);
      if (inside) return inside;
    }
  }
  return null;
}

// The list with this key ("root" or a path key).
export function listAt(steps: EditorStep[], key: string): EditorStep[] {
  if (key === ROOT) return steps;
  for (const step of allSteps(steps)) {
    const path = paths(step).find((p) => p.key === key);
    if (path) return path.list;
  }
  return [];
}

// Rewrites one list, wherever it sits in the tree.
export function changeList(steps: EditorStep[], list: string, change: (list: EditorStep[]) => EditorStep[]): EditorStep[] {
  const walk = (current: EditorStep[], key: string): EditorStep[] => (key === list ? change(current) : current).map((step) => withPaths(step, walk));
  return walk(steps, ROOT);
}

export function changeStep(steps: EditorStep[], id: string, patch: Partial<EditorStep>): EditorStep[] {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : withPaths(step, (list) => changeStep(list, id, patch))));
}

// Steps sure to have run once a list is done: everything on a split's paths, but of an If
// only the If itself (its paths might not run).
const surelyRan = (list: EditorStep[]): EditorStep[] => list.flatMap((step) => (step.kind === "split" ? step.lanes.flatMap(surelyRan) : [step]));

// Steps that are sure to have run before this one, so it can use their output by name.
// Steps on other paths of the same split are left out: they run, but maybe after this one.
export function earlierSteps(steps: EditorStep[], id: string): EditorStep[] {
  const walk = (list: EditorStep[], before: EditorStep[]): EditorStep[] | null => {
    const seen = [...before];
    for (const step of list) {
      if (step.id === id) return seen;
      const own = step.kind === "condition" ? [step] : [];
      for (const path of paths(step)) {
        const inside = walk(path.list, [...seen, ...own]);
        if (inside) return inside;
      }
      seen.push(...surelyRan([step]));
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
  if (config.type === "telegram_message") {
    return makeStep({ id: node.id, kind: "telegram_message", name: node.name, credentialId: config.credentialId, chatId: config.chatId, text: config.text });
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
// (possible when built through the API), rather than showing something that would save back differently.
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

  // Where several paths meet again: the first step all of them lead to.
  const joinOf = (starts: (string | undefined)[]): string | undefined => {
    if (starts.some((start) => start === undefined)) return undefined;
    const reach = starts.map((start) => reachable(start!));
    const common = [...reach[0]].filter((id) => reach.every((set) => set.has(id)));
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
        const join = joinOf([yesStart, noStart]);
        const yes = sequence(yesStart === join ? undefined : yesStart, join);
        const no = sequence(noStart === join ? undefined : noStart, join);
        if (!yes || !no) return null;
        list.push({ ...toStep(node), yes, no });
        current = join;
      } else if (edges.length > 1) {
        // One step feeding several: a split right after it.
        const targets = edges.map((edge) => edge.to);
        const join = joinOf(targets);
        const lanes = targets.map((target) => sequence(target === join ? undefined : target, join));
        if (lanes.some((lane) => !lane)) return null;
        list.push(toStep(node), makeSplit(lanes as EditorStep[][]));
        current = join;
      } else {
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
  if (step.kind === "telegram_message") {
    return { id: step.id, name, config: { type: "telegram_message", credentialId: step.credentialId, chatId: step.chatId.trim(), text: step.text } };
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
// (or itself, labelled, when a path is empty); a split hands the same ends to every path
// and leaves all their ends. Either way the next step joins them back together.
function connect(list: EditorStep[], entries: Exit[], edges: WorkflowEdge[]): Exit[] {
  let exits = entries;
  for (const step of list) {
    if (step.kind === "split") {
      const incoming = exits;
      exits = step.lanes.flatMap((lane) => connect(lane, incoming, edges));
      continue;
    }
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
  return { name: draft.name.trim(), trigger: draft.trigger, nodes: runnable(draft.steps).map(toNode), edges };
}

/* ---------- Validation: catch problems here, with messages a person can act on ---------- */

export interface Problems {
  general: string | null;
  steps: Record<string, string>; // step (or split) id -> what's wrong with it
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
  const taken = new Set(runnable(steps).map((step) => nameKey(step.name)));
  if (!taken.has(nameKey(name))) return name;
  let n = 2;
  while (taken.has(nameKey(`${name} ${n}`))) n++;
  return `${name} ${n}`;
}

// Where a split may go: straight after an ordinary step, whose output each path gets. (After an
// If or another split there'd be several steps to share from, and the first step of a workflow
// must be a real step.)
function splitProblem(list: EditorStep[], index: number): string | null {
  const before = list[index - 1];
  const split = list[index];
  if (!before || before.kind === "split" || before.kind === "condition") {
    return "These branches need an ordinary step before them: each branch gets that step's output.";
  }
  // One empty branch is fine: it passes the data straight on to the step after. Two would connect the same steps twice.
  if (split.lanes.filter((lane) => lane.length === 0).length > 1) return "Only one branch can be empty. Add a step to the others.";
  return null;
}

export function validate(draft: Draft): Problems | null {
  const steps: Record<string, string> = {};
  const seenNames = new Set<string>();

  const checkSplits = (list: EditorStep[]) =>
    list.forEach((step, i) => {
      if (step.kind === "split") {
        const problem = splitProblem(list, i);
        if (problem) steps[step.id] = problem;
      }
      paths(step).forEach((path) => checkSplits(path.list));
    });
  checkSplits(draft.steps);

  for (const step of runnable(draft.steps)) {
    const duplicate = seenNames.has(nameKey(step.name));
    seenNames.add(nameKey(step.name));

    if (!step.name.trim()) steps[step.id] = "Give this step a name.";
    else if (duplicate) steps[step.id] = "Another step already has this name. Give each step its own.";
    else if (step.kind === "llm_call" && !step.prompt.trim()) steps[step.id] = "Write a prompt for the AI.";
    else if (step.kind === "condition") {
      if (!step.question.trim()) steps[step.id] = "Write the yes/no question the AI should answer.";
      else if (step.yes.length === 0 && step.no.length === 0) steps[step.id] = "Add a step to the Yes or the No path.";
    } else if (step.kind === "telegram_message") {
      if (!step.credentialId) steps[step.id] = "Pick the Telegram bot to send from.";
      else if (!step.chatId.trim()) steps[step.id] = "Enter the chat ID to send to.";
      else if (!step.text.trim()) steps[step.id] = "Write the message to send.";
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
  else if (draft.trigger.type === "telegram" && !draft.trigger.credentialId) general = "Pick the Telegram bot that starts this workflow.";
  else if (Object.keys(steps).length > 0) general = "Some steps need attention.";

  return general || Object.keys(steps).length > 0 ? { general, steps } : null;
}
