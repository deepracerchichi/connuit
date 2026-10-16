import type { NodeId, Workflow } from "../domain/workflow.js";
import type { Run, Step } from "../domain/run.js";
import { findStartNodes, incomingEdges, topologicalOrder } from "./graph.js";
import { executeNode } from "./execute.js";
import { decide } from "./decide.js";
import { reserveAiCall, UsageLimitError } from "../services/usageService.js";

export async function runWorkflow(
  workflow: Workflow,
  runId: string,
  credentialValues: Map<string, string>,
  input?: unknown,
): Promise<Run> {
  if (findStartNodes(workflow).length !== 1) {
    throw new Error("A workflow needs exactly one first step (the one the trigger starts).");
  }
  const order = topologicalOrder(workflow); // throws on loops and broken connections

  const run: Run = { id: runId, workflowId: workflow.id, status: "running", steps: [] };

  const outputs = new Map<NodeId, unknown>(); // what each step that ran passes on
  const outputsByName = new Map<string, unknown>(); // for {{steps.Name...}}
  const decisions = new Map<NodeId, "yes" | "no">(); // what each If step answered
  const names = new Map(workflow.nodes.map((node) => [node.id, node.name]));

  for (const node of order) {
    const incoming = incomingEdges(workflow, node.id);
    const isFirst = incoming.length === 0;

    // A connection is live if its step ran and, when it leaves an If step, it matches the answer given.
    const live = incoming.filter(
      (edge) => outputs.has(edge.from) && (!edge.branch || edge.branch === decisions.get(edge.from)),
    );

    // Nothing reached this step: skip it. Skipped steps add no output, so everything after them skips too.
    if (!isFirst && live.length === 0) {
      const now = new Date();
      run.steps.push({ nodeId: node.id, status: "skipped", startedAt: now, finishedAt: now, attempt: 1 });
      continue;
    }

    // First step: the trigger's input. One parent: its output. Several (a merge): all of them, by step name.
    const stepInput = isFirst
      ? input
      : live.length === 1
        ? outputs.get(live[0].from)
        : Object.fromEntries(live.map((edge) => [names.get(edge.from), outputs.get(edge.from)]));

    const step: Step = { nodeId: node.id, status: "running", startedAt: new Date(), attempt: 1 };
    run.steps.push(step);

    try {
      // AI steps and If steps call the AI: count it first, and stop here if today's allowance is used up.
      if (node.config.type === "llm_call" || node.config.type === "condition") {
        await reserveAiCall(workflow.userId);
      }

      if (node.config.type === "condition") {
        const decision = await decide(node.config.question, stepInput);
        decisions.set(node.id, decision);
        step.decision = decision;
        step.output = { decision };
        outputs.set(node.id, stepInput); // an If step passes its input straight through
        outputsByName.set(node.name, stepInput);
      } else {
        const output = await executeNode(node, credentialValues, stepInput, outputsByName);
        step.output = output;
        outputs.set(node.id, output);
        outputsByName.set(node.name, output);
      }
      step.status = "succeeded";
      step.finishedAt = new Date();
    } catch (error) {
      step.status = "failed";
      step.finishedAt = new Date();
      step.error = error instanceof Error ? error.message : String(error);
      run.status = "failed";
      if (error instanceof UsageLimitError) run.retryable = false; // it would only fail the same way
      return run;
    }
  }

  run.status = "succeeded";
  return run;
}
