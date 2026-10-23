// src/features/relations/excel/remap.ts
// Ao reimportar um fluxo em outra sessão, os ids das planilhas mudam. Religa os nós de tabela pelo NOME
// que a planilha tinha na exportação (só quando o nome é único entre as planilhas abertas).

import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph } from '../model/graph';

export interface RemapResult {
  graph: FlowGraph;
  /** Quantos nós de tabela foram religados a uma planilha de outro id. */
  remapped: number;
  /** Ids de planilha que continuam sem correspondência. */
  unresolved: string[];
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

export function remapSheetIdsByName(
  graph: FlowGraph,
  sheetNames: ReadonlyMap<string, string>,
  sheets: readonly Sheet[]
): RemapResult {
  const knownIds = new Set(sheets.map(s => s.id));
  const idsByName = new Map<string, string[]>();
  for (const sheet of sheets) {
    const key = normalizeName(sheet.name);
    const list = idsByName.get(key);
    if (list) list.push(sheet.id);
    else idsByName.set(key, [sheet.id]);
  }

  let remapped = 0;
  const unresolved = new Set<string>();
  const nodes = graph.nodes.map(node => {
    if (node.kind !== 'table' || knownIds.has(node.sheetId)) return node;
    const name = sheetNames.get(node.sheetId);
    const candidates = name === undefined ? [] : (idsByName.get(normalizeName(name)) ?? []);
    if (candidates.length === 1) {
      remapped++;
      return { ...node, sheetId: candidates[0] };
    }
    unresolved.add(node.sheetId);
    return node;
  });
  return { graph: { ...graph, nodes }, remapped, unresolved: [...unresolved] };
}
