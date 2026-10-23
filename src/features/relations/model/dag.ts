// src/features/relations/model/dag.ts
// Ordem de execução e propagação de mudanças sobre o grafo.

import { FlowEdge, FlowGraph, FlowPort } from './graph';

export type TopologicalResult =
  | { ok: true; order: string[] }
  | { ok: false; cycle: string[] };

/** Ordenação topológica (Kahn). Em caso de ciclo devolve os nós que ficaram presos nele. */
export function topologicalOrder(graph: FlowGraph): TopologicalResult {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }

  // A ordem de inserção dos nós desempata, mantendo o resultado estável.
  const queue = graph.nodes.filter(n => indegree.get(n.id) === 0).map(n => n.id);
  const order: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (order.length === graph.nodes.length) return { ok: true, order };
  const done = new Set(order);
  return { ok: false, cycle: graph.nodes.filter(n => !done.has(n.id)).map(n => n.id) };
}

/** Nós alcançáveis a partir de `startIds` (inclui os próprios `startIds`). */
export function downstreamOf(graph: FlowGraph, startIds: Iterable<string>): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge.to);
    else outgoing.set(edge.from, [edge.to]);
  }

  const seen = new Set<string>();
  const stack = [...startIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }
  return seen;
}

/** Arestas de entrada de um nó, indexadas pela porta. */
export function inputsOf(graph: FlowGraph, nodeId: string): Partial<Record<FlowPort, FlowEdge>> {
  const inputs: Partial<Record<FlowPort, FlowEdge>> = {};
  for (const edge of graph.edges) {
    if (edge.to === nodeId) inputs[edge.toPort] = edge;
  }
  return inputs;
}
