// src/features/relations/model/persistence.ts
// Persistência do grafo. Tudo que volta do armazenamento passa pelo validador.

import { createEmptyGraph, FlowGraph } from './graph';
import { parseFlowGraph } from './schema';

export const FLOW_GRAPH_STORAGE_KEY = 'nocodb_flow_graph_v1';
const MAX_STORED_BYTES = 2_000_000;

export function saveFlowGraph(graph: FlowGraph): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FLOW_GRAPH_STORAGE_KEY, JSON.stringify(graph));
  } catch {
    // quota excedida ou storage indisponível: o grafo continua válido em memória
  }
}

export function loadFlowGraph(): FlowGraph {
  try {
    if (typeof localStorage === 'undefined') return createEmptyGraph();
    const raw = localStorage.getItem(FLOW_GRAPH_STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_BYTES) return createEmptyGraph();
    const parsed = parseFlowGraph(JSON.parse(raw));
    return parsed.ok ? parsed.graph : createEmptyGraph();
  } catch {
    return createEmptyGraph();
  }
}
