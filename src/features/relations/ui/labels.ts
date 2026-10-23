// src/features/relations/ui/labels.ts
// Nome legível de um nó do grafo (para painéis, dicas e mensagens).

import { FlowNode } from '../model/graph';
import { summarizeTransform } from './nodeText';

export function nodeDisplayName(node: FlowNode, sheetNames: ReadonlyMap<string, string>): string {
  if (node.label) return node.label;
  switch (node.kind) {
    case 'table':
      return sheetNames.get(node.sheetId) ?? `Planilha ${node.sheetId}`;
    case 'output':
      return node.sheetName;
    case 'transform':
      return summarizeTransform(node.params).title;
  }
}
