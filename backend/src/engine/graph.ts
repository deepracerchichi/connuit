import type { NodeId, WorkflowEdge } from "../domain/workflow.js";

// The helpers only need steps (anything with an id) and the connections between them,
// so the engine (a saved Workflow) and validation (an incoming request) share them.
interface Graph<N extends { id: NodeId }> {
  nodes: N[];
  edges: WorkflowEdge[];
}

// Steps with no connection coming into them: where a run starts.
export function findStartNodes<N extends { id: NodeId }>(graph: Graph<N>): N[] {
  return graph.nodes.filter((node) => !graph.edges.some((edge) => edge.to === node.id));
}

// Edges leaving a node.
export function outgoingEdges<N extends { id: NodeId }>(graph: Graph<N>, nodeId: NodeId): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId);
}

// Edges arriving at a node.
export function incomingEdges<N extends { id: NodeId }>(graph: Graph<N>, nodeId: NodeId): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.to === nodeId);
}

// Puts the steps in an order where every step comes after all the steps that feed into it
// (Kahn's algorithm). Throws if the graph has a loop, which would make a run go round forever.
export function topologicalOrder<N extends { id: NodeId }>(graph: Graph<N>): N[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`A connection points to a step that doesn't exist (${edge.from} → ${edge.to}).`);
    }
  }

  // How many parents each step is still waiting on.
  const waitingOn = new Map<NodeId, number>();
  for (const node of graph.nodes) waitingOn.set(node.id, 0);
  for (const edge of graph.edges) waitingOn.set(edge.to, waitingOn.get(edge.to)! + 1);

  const ready = graph.nodes.filter((node) => waitingOn.get(node.id) === 0);
  const ordered: N[] = [];

  while (ready.length > 0) {
    const node = ready.shift()!;
    ordered.push(node);

    for (const edge of outgoingEdges(graph, node.id)) {
      const remaining = waitingOn.get(edge.to)! - 1;
      waitingOn.set(edge.to, remaining);
      if (remaining === 0) ready.push(graph.nodes.find((n) => n.id === edge.to)!);
    }
  }

  if (ordered.length !== graph.nodes.length) {
    throw new Error("This workflow has a loop: a step leads back to an earlier step.");
  }
  return ordered;
}
