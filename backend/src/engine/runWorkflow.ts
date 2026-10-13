import type { Workflow } from "../domain/workflow.js";
import type { Run, Step } from "../domain/run.js";
import { findStartNodes, findNextNodes } from "./graph.js";
import { executeNode } from "./execute.js";


export async function runWorkflow(workflow: Workflow, runId: string, credentialValues: Map<string, string>, input?: unknown): Promise<Run> {
  const startNodes = findStartNodes(workflow);
  if (startNodes.length !== 1) {
    throw new Error("Only workflows with exactly one starting node are supported right now.");
  }

  const run: Run = {
    id: runId,              // ← was crypto.randomUUID(), now passed in
    workflowId: workflow.id,
    status: "running",
    steps: [],
  };
  // ...rest unchanged


    let currentNode = startNodes[0];
    let previousOutput: unknown = input;
    while (true) {
        const step: Step = {
            nodeId:currentNode.id,
            status: "running",
            startedAt: new Date(),
            attempt: 1,
        };
        run.steps.push(step);

        try {
            const output = await executeNode(currentNode, credentialValues, previousOutput);
            step.status = "succeeded";
            step.finishedAt= new Date();
            step.output = output;
            previousOutput= output;
        } catch (error) {
            step.finishedAt =  new Date();
            step.status = "failed";
            step.error = error instanceof Error ? error.message : String(error);
            run.status = "failed";
            return run;
        }

        const nextNodes = findNextNodes(workflow, currentNode.id);

        if (nextNodes.length === 0) {
            run.status = "succeeded";
            return run;
        }

        if (nextNodes.length > 1) {
            throw new Error("Branching workflows are not supported yet.");
            
        }

        currentNode = nextNodes[0];
    }
}