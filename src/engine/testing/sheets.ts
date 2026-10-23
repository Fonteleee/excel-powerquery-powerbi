// src/engine/testing/sheets.ts
// Utilitários de teste: monta planilhas a partir de matrizes e lê células por endereço (A1).

import { CellData, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, parseCellAddress } from '../formulaParser';

export type GridInput = (string | number | boolean | null)[][];

function toCell(input: string | number | boolean): CellData {
  if (typeof input === 'string' && input.startsWith('=')) return { raw: input, value: null };
  if (typeof input === 'number') return { raw: String(input), value: input };
  if (typeof input === 'boolean') return { raw: String(input), value: input };
  return { raw: input, value: input };
}

/** Monta uma planilha: linha 0 do array = linha 1 da planilha. Strings iniciadas por "=" viram fórmulas. */
export function buildSheet(id: string, name: string, grid: GridInput, rowCount = Math.max(grid.length + 5, 20)): Sheet {
  const data: Record<string, CellData> = {};
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null) return;
      data[cellPosToKey(r, c)] = toCell(cell);
    });
  });
  return {
    id,
    name,
    data,
    rowCount,
    colCount: Math.max(10, ...grid.map(r => r.length)),
    colWidths: {},
    rowHeights: {},
    mergedRegions: [],
    conditionalRules: [],
  };
}

/** Lê a célula pelo endereço ("B3"). */
export function cellAt(sheet: Sheet, address: string): CellData | undefined {
  const pos = parseCellAddress(address);
  if (!pos) throw new Error(`Endereço inválido: ${address}`);
  return sheet.data[cellPosToKey(pos.row, pos.col)];
}

/** Valor calculado da célula pelo endereço ("B3"). */
export function valueAt(sheet: Sheet, address: string): CellData['value'] | undefined {
  return cellAt(sheet, address)?.value;
}

/** Devolve uma cópia da planilha com a célula alterada (como o editor faz). Não recalcula. */
export function withCell(sheet: Sheet, address: string, raw: string): Sheet {
  const pos = parseCellAddress(address);
  if (!pos) throw new Error(`Endereço inválido: ${address}`);
  const next: Record<string, CellData> = { ...sheet.data };
  const key = cellPosToKey(pos.row, pos.col);
  if (raw === '') delete next[key];
  else next[key] = toCell(Number.isFinite(Number(raw)) && raw.trim() !== '' && !raw.startsWith('=') ? Number(raw) : raw);
  return { ...sheet, data: next };
}
