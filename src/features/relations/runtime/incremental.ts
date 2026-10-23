// src/features/relations/runtime/incremental.ts
// Reavaliação incremental: só os nós sujos são recalculados; o resto reaproveita o resultado anterior.

import { Sheet } from '../../../types/spreadsheet';
import { dirtyNodes } from '../model/dirty';
import { FlowGraph } from '../model/graph';
import { evaluateGraph, NodeResult } from './evaluate';

export interface EvaluationSnapshot {
  graph: FlowGraph;
  sheets: readonly Sheet[];
  results: Map<string, NodeResult>;
}

/**
 * Se as planilhas mudaram (outra referência), reavalia tudo. Se só o grafo mudou,
 * reavalia os nós alterados e seus dependentes. Sem mudança semântica devolve os mesmos resultados.
 */
export function evaluateIncremental(
  previous: EvaluationSnapshot | null,
  graph: FlowGraph,
  sheets: readonly Sheet[]
): EvaluationSnapshot {
  if (!previous || previous.sheets !== sheets) {
    return { graph, sheets, results: evaluateGraph(graph, sheets) };
  }
  const dirty = dirtyNodes(previous.graph, graph);
  if (dirty.size === 0 && previous.graph.nodes.length === graph.nodes.length) {
    return { graph, sheets, results: previous.results };
  }
  return { graph, sheets, results: evaluateGraph(graph, sheets, { previous: previous.results, dirty }) };
}
