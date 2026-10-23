// src/features/relations/analysis/connectContext.ts
// Monta o contexto (colunas, tipos, nomes) que o plano de conexão precisa, a partir dos resultados avaliados.

import { FlowGraph } from '../model/graph';
import type { NodeResult } from '../runtime/evaluate';
import type { ConnectContext } from './connectPlan';
import { inferTableTypes } from './typeInference';

export function createConnectContext(
  graph: FlowGraph,
  results: ReadonlyMap<string, NodeResult>,
  sheetNames: ReadonlyMap<string, string>
): ConnectContext {
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  return {
    columnsOf: nodeId => results.get(nodeId)?.table?.headers ?? [],
    typeOf: (nodeId, column) => {
      const table = results.get(nodeId)?.table;
      return table ? inferTableTypes(table)[column] : undefined;
    },
    nameOf: nodeId => {
      const node = nodeById.get(nodeId);
      if (!node) return nodeId;
      if (node.kind === 'table') return sheetNames.get(node.sheetId) ?? node.sheetId;
      return node.label ?? nodeId;
    },
    sampleOf: (nodeId, column) => {
      const rows = results.get(nodeId)?.table?.rows ?? [];
      for (const row of rows) {
        const value = row[column];
        if (value !== null && value !== undefined && value !== '') return String(value);
      }
      return undefined;
    },
  };
}
