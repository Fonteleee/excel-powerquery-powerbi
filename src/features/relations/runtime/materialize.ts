// src/features/relations/runtime/materialize.ts
// Materialização IDEMPOTENTE: cada nó de saída escreve sempre na mesma aba (`flow-out-<id>`).
// Rodar duas vezes dá o mesmo resultado; remover o nó remove a aba; planilhas do usuário nunca são tocadas.

import { Sheet } from '../../../types/spreadsheet';
import { createSheetFromDataset } from '../../../engine/pipelineEngine';
import { FlowGraph } from '../model/graph';
import { evaluateGraph, NodeResult } from './evaluate';

export const FLOW_SHEET_PREFIX = 'flow-out-';

export const flowSheetId = (outputNodeId: string): string => `${FLOW_SHEET_PREFIX}${outputNodeId}`;

export interface MaterializeResult {
  sheets: Sheet[];
  written: string[]; // ids das abas escritas
  removed: string[]; // ids das abas de fluxo removidas por não terem mais nó de saída
  errors: Record<string, string>; // id do nó de saída -> motivo
}

/** Nome sem colisão com abas que não pertencem ao fluxo. */
function freeSheetName(wanted: string, ownId: string, sheets: readonly Sheet[]): string {
  const taken = new Set(sheets.filter(s => s.id !== ownId).map(s => s.name));
  if (!taken.has(wanted)) return wanted;
  let n = 2;
  while (taken.has(`${wanted} (${n})`)) n++;
  return `${wanted} (${n})`;
}

export function materializeGraph(
  graph: FlowGraph,
  sheets: readonly Sheet[],
  results: ReadonlyMap<string, NodeResult> = evaluateGraph(graph, sheets)
): MaterializeResult {
  let next = [...sheets];
  const written: string[] = [];
  const errors: Record<string, string> = {};
  const outputIds = new Set<string>();

  for (const node of graph.nodes) {
    if (node.kind !== 'output') continue;
    const id = flowSheetId(node.id);
    outputIds.add(id);

    const result = results.get(node.id);
    if (!result || result.error || !result.table) {
      errors[node.id] = result?.rootCause ?? result?.error ?? 'Sem resultado';
      continue; // mantém a aba anterior intacta
    }

    const name = freeSheetName(node.sheetName, id, next);
    const sheet = createSheetFromDataset(id, name, result.table.headers, result.table.rows);
    const at = next.findIndex(s => s.id === id);
    if (at >= 0) next[at] = sheet;
    else next = [...next, sheet];
    written.push(id);
  }

  const removed = next.filter(s => s.id.startsWith(FLOW_SHEET_PREFIX) && !outputIds.has(s.id)).map(s => s.id);
  if (removed.length > 0) {
    const gone = new Set(removed);
    next = next.filter(s => !gone.has(s.id));
  }

  return { sheets: next, written, removed, errors };
}
