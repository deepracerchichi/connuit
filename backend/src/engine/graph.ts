import type { NodeId, Workflow, WorkflowEdge, WorkflowNode } from "../domain/workflow.js";

export function findStartNodes(workflow: Workflow): WorkflowNode[] {
  const startNodes: WorkflowNode[] = [];

  for (const node of workflow.nodes) {
    let hasArrowPointingToIt = false;

    for (const edge of workflow.edges) {
      if (edge.to === node.id) {
        hasArrowPointingToIt = true;
      }
    }

    if (!hasArrowPointingToIt) {
      startNodes.push(node);
    }
  }

  return startNodes;
}




// Edges leaving a node.
export function outgoingEdges(workflow: Workflow, nodeId: NodeId): WorkflowEdge[] {
  return workflow.edges.filter((edge) => edge.from === nodeId);
}

// Edges arriving at a node.
export function incomingEdges(workflow: Workflow, nodeId: NodeId): WorkflowEdge[] {
  return workflow.edges.filter((edge) => edge.to === nodeId);
}

// Puts the steps in an order where every step comes after all the steps that feed into it
// (Kahn's algorithm). Throws if the graph has a loop, which would make a run go round forever.
export function topologicalOrder(workflow: Workflow): WorkflowNode[] {
  const ids = new Set(workflow.nodes.map((node) => node.id));
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`A connection points to a step that doesn't exist (${edge.from} → ${edge.to}).`);
    }
  }

  // How many parents each step is still waiting on.
  const waitingOn = new Map<NodeId, number>();
  for (const node of workflow.nodes) waitingOn.set(node.id, 0);
  for (const edge of workflow.edges) waitingOn.set(edge.to, waitingOn.get(edge.to)! + 1);

  const ready = workflow.nodes.filter((node) => waitingOn.get(node.id) === 0);
  const ordered: WorkflowNode[] = [];

  while (ready.length > 0) {
    const node = ready.shift()!;
    ordered.push(node);

    for (const edge of outgoingEdges(workflow, node.id)) {
      const remaining = waitingOn.get(edge.to)! - 1;
      waitingOn.set(edge.to, remaining);
      if (remaining === 0) ready.push(workflow.nodes.find((n) => n.id === edge.to)!);
    }
  }

  if (ordered.length !== workflow.nodes.length) {
    throw new Error("This workflow has a loop: a step leads back to an earlier step.");
  }
  return ordered;
}

