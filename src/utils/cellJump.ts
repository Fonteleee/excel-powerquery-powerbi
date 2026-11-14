// src/utils/cellJump.ts
// Caixa de Nome / "Ir para": interpreta o texto digitado (célula, intervalo, coluna ou linha inteira).

import type { CellPosition, CellRange } from '../types/spreadsheet';
import { parseCellAddress, parseRangeAddress } from '../engine/formulas/addressing';

export interface JumpTarget {
  /** Célula ativa (canto superior esquerdo do intervalo). */
  cell: CellPosition;
  range: CellRange;
}

export type JumpResult = { ok: true; target: JumpTarget } | { ok: false; error: string };

/**
 * Aceita "B2", "$B$2", "A1:C10", "B:B", "A:C", "3:3", "2:5" e minúsculas.
 * Valida contra o tamanho da planilha; erro vem em português para exibir com notify().
 */
export function parseJumpTarget(text: string, rowCount: number, colCount: number): JumpResult {
  const t = text.trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return { ok: false, error: 'Digite um endereço, por exemplo B2 ou A1:C10.' };
  const lastRow = Math.max(0, rowCount - 1);
  const lastCol = Math.max(0, colCount - 1);

  let range: CellRange | null = null;

  const rowsOnly = t.match(/^\$?(\d+):\$?(\d+)$/);
  if (rowsOnly) {
    const a = parseInt(rowsOnly[1], 10) - 1;
    const b = parseInt(rowsOnly[2], 10) - 1;
    if (a < 0 || b < 0) return { ok: false, error: `Endereço "${text.trim()}" inválido.` };
    range = { startRow: Math.min(a, b), startCol: 0, endRow: Math.max(a, b), endCol: lastCol };
  } else if (/^[A-Z$]+:[A-Z$]+$/.test(t) && t.replace(/\$/g, '').match(/^[A-Z]+:[A-Z]+$/)) {
    range = parseRangeAddress(t, rowCount);
  } else if (/^\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?$/.test(t)) {
    range = parseRangeAddress(t, rowCount);
  } else if (parseCellAddress(t)) {
    const c = parseCellAddress(t)!;
    range = { startRow: c.row, startCol: c.col, endRow: c.row, endCol: c.col };
  }

  if (!range) return { ok: false, error: `Endereço "${text.trim()}" inválido. Use, por exemplo, B2, A1:C10 ou B:B.` };
  if (range.startRow < 0 || range.startCol < 0 || range.endRow > lastRow || range.endCol > lastCol) {
    return { ok: false, error: `"${text.trim()}" fica fora da tabela (${rowCount} linhas x ${colCount} colunas).` };
  }
  return { ok: true, target: { cell: { row: range.startRow, col: range.startCol }, range } };
}
