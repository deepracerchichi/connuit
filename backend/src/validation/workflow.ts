import { z } from "zod";
import cron from "node-cron";


const urlOrTemplate = z.string().refine(
  (val) => /\{\{(previousOutput|credential)\}\}/.test(val) || z.string().url().safeParse(val).success,
  { message: "Must be a valid URL, or contain a {{previousOutput}} / {{credential}} placeholder" }
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
]);

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("webhook") }),
  z.object({
  type: z.literal("cron"),
  schedule: z.string().refine((s) => cron.validate(s), { message: "Not a valid cron expression" }),
}),

]);

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  trigger: triggerSchema,
  nodes: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), config: nodeConfigSchema }))
    .min(1),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});




