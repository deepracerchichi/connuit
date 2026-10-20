import { z } from "zod";
import cron from "node-cron";
import { findStartNodes, topologicalOrder } from "../engine/graph.js";


const urlOrTemplate = z.string().refine(
  (val) => /\{\{\s*(previousOutput|credential|steps\.)/.test(val) || z.url().safeParse(val).success,
  { message: "Must be a valid URL, or contain a {{previousOutput}}, {{steps.…}} or {{credential}} placeholder" }
);


const nodeConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("http_request"),
    url: urlOrTemplate,
    method: z.enum(["GET", "POST", "PUT", "DELETE"]),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    credentialId: z.string().optional(),
  }),
  z.object({
    type: z.literal("llm_call"),
    prompt: z.string().min(1),
    systemPrompt: z.string().optional(),
  }),
  z.object({
  type: z.literal("condition"),
  question: z.string().min(1),
}),

  z.object({
    type: z.literal("telegram_message"),
    credentialId: z.string().min(1),
    chatId: z.string().min(1),
    text: z.string().min(1),
  }),
]);

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("webhook") }),
  z.object({ type: z.literal("telegram"), credentialId: z.string().min(1, "Pick the Telegram bot that starts this workflow.") }),
  z.object({
  type: z.literal("cron"),
  schedule: z
  .string()
  .refine((s) => cron.validate(s), { message: "Not a valid cron expression" })
  .refine(atMostEveryFiveMinutes, { message: "Schedules can run at most every 5 minutes" }),
}),

]);

export const createWorkflowSchema = z
  .object({
    name: z.string().min(1),
    trigger: triggerSchema,
    nodes: z
      .array(z.object({ id: z.string().min(1), name: z.string().min(1), config: nodeConfigSchema }))
      .min(1),
    edges: z.array(z.object({ from: z.string(), to: z.string(), branch: z.enum(["yes", "no"]).optional() })),
  })
  // Shape checks pass one field at a time; these look at the workflow as a whole graph.
  .superRefine((workflow, ctx) => {
    const problem = graphProblem(workflow);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["edges"] });
  });

// Never trust the client: the editor already prevents these, but a direct API call might not.
// Returns the first problem in plain words, or null if the graph is sound.
function graphProblem(workflow: {
  nodes: { id: string; name: string; config: { type: string } }[];
  edges: { from: string; to: string; branch?: "yes" | "no" }[];
}): string | null {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const node of workflow.nodes) {
    if (ids.has(node.id)) return `Two steps share the id "${node.id}".`;
    // {{steps.Name...}} finds steps by name, so names must be unique.
    const name = node.name.trim().toLowerCase();
    if (names.has(name)) return `Two steps are called "${node.name.trim()}". Give each step its own name.`;
    ids.add(node.id);
    names.add(name);
  }

  const seen = new Set<string>();
  for (const edge of workflow.edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return "The same two steps are connected twice.";
    seen.add(key);
  }

  const isIf = new Map(workflow.nodes.map((node) => [node.id, node.config.type === "condition"]));
  for (const edge of workflow.edges) {
    if (edge.branch && isIf.get(edge.from) === false) {
      return "Only If steps can have yes/no connections.";
    }
    if (!edge.branch && isIf.get(edge.from) === true) {
      return "Every connection out of an If step must be marked yes or no.";
    }
  }

  // Loops first: a graph that is all loop has no first step, and "has a loop" is the clearer message.
  try {
    topologicalOrder(workflow); // the engine's own check: loops and connections to missing steps
  } catch (error) {
    return error instanceof Error ? error.message : "The connections between steps aren't valid.";
  }

  if (findStartNodes(workflow).length !== 1) {
    return "A workflow needs exactly one first step (the one the trigger starts), and every other step must be connected.";
  }
  return null;
}

// Cost and abuse guard: 5 fields only (node-cron's 6-field form adds seconds),
// and nothing more often than every 5 minutes.
function atMostEveryFiveMinutes(schedule: string) {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const minute = fields[0];
  if (minute === "*") return false;
  const step = minute.match(/^\*\/(\d+)$/);
  return step ? Number(step[1]) >= 5 : true;
}



