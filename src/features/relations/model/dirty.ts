// src/features/relations/model/dirty.ts
// Detecta quais nós precisam ser reavaliados entre duas versões do grafo.
// Posição (x, y) e rótulo não alteram o resultado, então mover nós não dispara recálculo.

import { downstreamOf } from './dag';
import { FlowGraph, FlowNode } from './graph';

function semanticPayload(node: FlowNode): string {
  switch (node.kind) {
    case 'table':
      return `table|${node.sheetId}`;
    case 'transform':
      return `transform|${JSON.stringify(node.params)}`;
    case 'output':
      return 'output';
  }
}

function inboundSignature(graph: FlowGraph, nodeId: string): string {
  return graph.edges
    .filter(e => e.to === nodeId)
    .map(e => `${e.toPort}<-${e.from}`)
    .sort()
    .join(',');
}

/** Nós alterados + tudo que depende deles. */
export function dirtyNodes(prev: FlowGraph, next: FlowGraph): Set<string> {
  const before = new Map(prev.nodes.map(n => [n.id, n]));
  const changed: string[] = [];

  for (const node of next.nodes) {
    const old = before.get(node.id);
    if (
      !old ||
      semanticPayload(old) !== semanticPayload(node) ||
      inboundSignature(prev, node.id) !== inboundSignature(next, node.id)
    ) {
      changed.push(node.id);
    }
  }
  return downstreamOf(next, changed);
}
