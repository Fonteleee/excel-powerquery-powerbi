// src/features/relations/ui/cardData.ts
// Dados derivados que os cartões precisam (campos com tipo inferido e amostra; estado das saídas). Puro.

import { Sheet } from '../../../types/spreadsheet';
import { cellPosToKey } from '../../../engine/formulaParser';
import { inferTableTypes } from '../analysis/typeInference';
import type { Cell, FlowTable } from '../runtime/evaluate';
import { cellText } from './format';
import type { CardColumn } from './TableCard';
import type { FlowGraph } from '../model/graph';
import { LAYOUT } from './tokens';

const SAMPLE_VALUES = 3;

/** Campos de uma tabela avaliada, com o tipo inferido pelos valores e os primeiros valores preenchidos. */
export function buildCardColumns(table: FlowTable | null | undefined): CardColumn[] {
  if (!table) return [];
  const types = inferTableTypes(table);
  return table.headers.map(name => {
    const samples: string[] = [];
    for (const row of table.rows) {
      if (samples.length >= SAMPLE_VALUES) break;
      const value = row[name];
      if (value !== null && value !== undefined && value !== '') samples.push(cellText(value));
    }
    return { name, info: types[name], samples };
  });
}

export type OutputStatusValue = 'pending' | 'stale' | 'fresh';

const COMPARE_ROWS = 5;

const sameCell = (a: Cell, b: Cell): boolean => cellText(a) === cellText(b);

/**
 * Compara a aba materializada com o resultado atual do nó de saída:
 *  - sem aba: pendente; cabeçalhos, nº de linhas ou primeiras linhas diferentes: desatualizada; senão: atualizada.
 * `createSheetFromDataset` dá à aba `max(linhas + 1, 30)` linhas, então o tamanho é comparável sem varrer a aba toda.
 */
export function outputStatus(sheet: Sheet | undefined, table: FlowTable | null | undefined): OutputStatusValue {
  if (!sheet) return 'pending';
  if (!table) return 'stale';
  if (sheet.rowCount !== Math.max(table.rows.length + 1, 30)) return 'stale';

  const valueAt = (row: number, col: number): Cell => sheet.data[cellPosToKey(row, col)]?.value as Cell;
  for (let c = 0; c < table.headers.length; c++) {
    if (!sameCell(valueAt(0, c), table.headers[c])) return 'stale';
  }
  const limit = Math.min(COMPARE_ROWS, table.rows.length);
  for (let r = 0; r < limit; r++) {
    for (let c = 0; c < table.headers.length; c++) {
      if (!sameCell(valueAt(r + 1, c), table.rows[r][table.headers[c]])) return 'stale';
    }
  }
  return 'fresh';
}

/** Tamanho aproximado de cada tipo de nó (um cartão de tabela é alto; o real depende dos campos). */
const EXTENT = {
  table: { width: LAYOUT.cardWidth, height: 340 },
  transform: { width: LAYOUT.hexWidth, height: LAYOUT.hexHeight },
  output: { width: LAYOUT.outputWidth, height: 90 },
} as const;

/** Caixa que envolve todos os nós considerando o tamanho de cada tipo ("ajustar à tela"). Null se vazio. */
export function flowBounds(graph: FlowGraph): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (graph.nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const size = EXTENT[node.kind];
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + size.width);
    maxY = Math.max(maxY, node.y + size.height);
  }
  return { minX, minY, maxX, maxY };
}