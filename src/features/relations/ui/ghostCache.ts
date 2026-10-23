// src/features/relations/ui/ghostCache.ts
// Cache por coluna das conexões fantasma. O cálculo é caro (lê outras planilhas), então só roda sob demanda
// e é reaproveitado enquanto as planilhas forem as mesmas (identidade do array). Também agrupa o resultado
// por tabela do fluxo para a UI destacar os campos. Puro (sem React).

import { Sheet } from '../../../types/spreadsheet';
import { GhostLinkResult, GhostSuggestion, suggestGhostLinks } from '../analysis/ghostLinks';
import { FlowGraph } from '../model/graph';

export const GHOST_CACHE_LIMIT = 64;
const GHOST_MAX_RESULTS = 6;

export type GhostCompute = (sheets: readonly Sheet[], sheetId: string, column: string) => GhostLinkResult;

export interface GhostCache {
  get: (sheets: readonly Sheet[], sheetId: string, column: string) => GhostLinkResult;
  size: () => number;
}

export function createGhostCache(
  compute: GhostCompute = (sheets, sheetId, column) => suggestGhostLinks(sheets, { sheetId, column }, { maxResults: GHOST_MAX_RESULTS }),
  limit = GHOST_CACHE_LIMIT
): GhostCache {
  let version: readonly Sheet[] | null = null;
  const entries = new Map<string, GhostLinkResult>();
  return {
    get(sheets, sheetId, column) {
      if (version !== sheets) {
        entries.clear();
        version = sheets;
      }
      const key = `${sheetId}\u0000${column}`;
      const hit = entries.get(key);
      if (hit) return hit;
      const result = compute(sheets, sheetId, column);
      if (entries.size >= limit) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      entries.set(key, result);
      return result;
    },
    size: () => entries.size,
  };
}

/** nodeId da tabela -> (coluna -> sugestão). Só entram planilhas que têm cartão no fluxo. */
export function groupGhostsByNode(graph: FlowGraph, suggestions: readonly GhostSuggestion[]): Map<string, Map<string, GhostSuggestion>> {
  const result = new Map<string, Map<string, GhostSuggestion>>();
  for (const suggestion of suggestions) {
    for (const node of graph.nodes) {
      if (node.kind !== 'table' || node.sheetId !== suggestion.sheetId) continue;
      const columns = result.get(node.id) ?? new Map<string, GhostSuggestion>();
      columns.set(suggestion.column, suggestion);
      result.set(node.id, columns);
    }
  }
  return result;
}

export function ghostTitle(suggestion: GhostSuggestion): string {
  return `Possível ligação (${Math.round(suggestion.score * 100)}%): ${suggestion.reason}`;
}
