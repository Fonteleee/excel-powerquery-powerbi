// src/features/relations/analysis/healthFix.ts
// Executa correções declarativas (HealthFix) devolvendo uma NOVA planilha. A original nunca é alterada,
// então o chamador desfaz simplesmente voltando à planilha anterior.

import { cellPosToKey, parseNumberSafely } from '../../../engine/formulaParser';
import { CellData, Sheet } from '../../../types/spreadsheet';
import { DATE_FORMATS, formatDate, parseDateText } from './dates';
import { FixPreview, HealthFix } from './healthTypes';
import {
  cellValue,
  classifyValue,
  dataRowIndexes,
  isFormulaCell,
  isForbiddenHeader,
  listColumns,
  normalizeSpaces,
  SheetColumn,
} from './sheetAccess';

const MAX_COLUMNS_PER_FIX = 200;

function unchanged(sheet: Sheet, skipped: string): FixPreview {
  return { sheet, changedCells: 0, removedRows: 0, skipped: [skipped] };
}

function resolveColumns(sheet: Sheet, headers: readonly string[], skipped: string[]): SheetColumn[] {
  const all = listColumns(sheet);
  const resolved: SheetColumn[] = [];
  for (const header of headers) {
    if (typeof header !== 'string' || isForbiddenHeader(header)) {
      skipped.push(`Coluna proibida ou inválida: "${String(header)}"`);
      continue;
    }
    const matches = all.filter(c => c.header === header);
    if (matches.length === 0) skipped.push(`Coluna "${header}" não encontrada`);
    resolved.push(...matches);
  }
  return resolved;
}

/** Troca o valor de uma célula, mantendo formato e demais propriedades. */
function withValue(cell: CellData, value: string | number): CellData {
  return { ...cell, raw: String(value), value };
}

/** Aplica `edit` a cada célula de dados (linhas >= 1, sem fórmulas) das colunas dadas. */
function editColumns(
  sheet: Sheet,
  columns: readonly SheetColumn[],
  edit: (cell: CellData) => CellData | null
): { data: Sheet['data']; changed: number } {
  const data = { ...sheet.data };
  let changed = 0;
  for (const column of columns) {
    for (let r = 1; r < sheet.rowCount; r++) {
      if (isFormulaCell(sheet, r, column.index)) continue;
      const key = cellPosToKey(r, column.index);
      const cell = data[key];
      if (!cell) continue;
      const next = edit(cell);
      if (next) {
        data[key] = next;
        changed++;
      }
    }
  }
  return { data, changed };
}

function trimSpaces(sheet: Sheet, headers: string[]): FixPreview {
  const skipped: string[] = [];
  const columns = resolveColumns(sheet, headers, skipped);
  const { data, changed } = editColumns(sheet, columns, cell => {
    if (typeof cell.value !== 'string') return null;
    const clean = normalizeSpaces(cell.value);
    return clean === cell.value ? null : withValue(cell, clean);
  });
  return { sheet: { ...sheet, data }, changedCells: changed, removedRows: 0, skipped };
}

function standardizeType(sheet: Sheet, header: string, to: 'number' | 'text'): FixPreview {
  const skipped: string[] = [];
  const columns = resolveColumns(sheet, [header], skipped);
  const { data, changed } = editColumns(sheet, columns, cell => {
    if (to === 'number') {
      if (typeof cell.value !== 'string' || classifyValue(cell.value) !== 'numericText') return null;
      const n = parseNumberSafely(cell.value);
      return n === null ? null : withValue(cell, n);
    }
    return typeof cell.value === 'number' && Number.isFinite(cell.value) ? withValue(cell, String(cell.value)) : null;
  });
  return { sheet: { ...sheet, data }, changedCells: changed, removedRows: 0, skipped };
}

function normalizeDates(sheet: Sheet, header: string, to: (typeof DATE_FORMATS)[number]): FixPreview {
  const skipped: string[] = [];
  const columns = resolveColumns(sheet, [header], skipped);
  let invalid = 0;
  const { data, changed } = editColumns(sheet, columns, cell => {
    if (typeof cell.value !== 'string') return null;
    const parsed = parseDateText(cell.value);
    if (!parsed || parsed.format === to) return null;
    if (!parsed.valid) {
      invalid++;
      return null;
    }
    return withValue(cell, formatDate(parsed, to));
  });
  if (invalid > 0) skipped.push(`${invalid} data(s) inválida(s) em "${header}" foram mantidas como estão`);
  return { sheet: { ...sheet, data }, changedCells: changed, removedRows: 0, skipped };
}

function removeDuplicates(sheet: Sheet): FixPreview {
  if (sheet.mergedRegions.length > 0) {
    return unchanged(sheet, 'A planilha tem células mescladas: remover linhas poderia desalinhá-las');
  }
  const columns = listColumns(sheet);
  const hasFormula = Object.values(sheet.data).some(cell => typeof cell.raw === 'string' && cell.raw.startsWith('='));
  if (hasFormula) {
    return unchanged(sheet, 'A planilha tem fórmulas: remover linhas poderia quebrar as referências');
  }

  const seen = new Set<string>();
  const removed = new Set<number>();
  for (const row of dataRowIndexes(sheet, columns)) {
    const signature = JSON.stringify(
      columns.map(col => {
        const value = cellValue(sheet, row, col.index);
        return value === null || value === undefined ? '' : String(value);
      })
    );
    if (seen.has(signature)) removed.add(row);
    else seen.add(signature);
  }
  if (removed.size === 0) return { sheet, changedCells: 0, removedRows: 0, skipped: [] };

  // Cada linha mantida sobe o número de linhas removidas acima dela.
  const sortedRemoved = [...removed].sort((a, b) => a - b);
  const shiftOf = (row: number): number => {
    let lo = 0;
    let hi = sortedRemoved.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedRemoved[mid] < row) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const data: Sheet['data'] = {};
  for (const [key, cell] of Object.entries(sheet.data)) {
    const match = /^R(\d+)C(\d+)$/.exec(key);
    if (!match) {
      data[key] = cell;
      continue;
    }
    const row = Number(match[1]);
    if (removed.has(row)) continue;
    data[`R${row - shiftOf(row)}C${match[2]}`] = cell;
  }
  const rowHeights: Sheet['rowHeights'] = {};
  for (const [key, height] of Object.entries(sheet.rowHeights)) {
    const row = Number(key);
    if (!removed.has(row)) rowHeights[row - shiftOf(row)] = height;
  }

  return { sheet: { ...sheet, data, rowHeights }, changedCells: 0, removedRows: removed.size, skipped: [] };
}

/**
 * Valida a correção (ela pode vir da UI ou de fora) e a executa em uma cópia da planilha.
 * Nunca lança exceção: problemas viram `skipped`.
 */
export function previewHealthFix(sheet: Sheet, fix: HealthFix): FixPreview {
  if (typeof fix !== 'object' || fix === null) return unchanged(sheet, 'Correção inválida');
  switch (fix.kind) {
    case 'trim_spaces':
      if (!Array.isArray(fix.columns) || fix.columns.length > MAX_COLUMNS_PER_FIX) {
        return unchanged(sheet, 'Lista de colunas inválida');
      }
      return trimSpaces(sheet, fix.columns);
    case 'standardize_type':
      if (typeof fix.column !== 'string' || (fix.to !== 'number' && fix.to !== 'text')) {
        return unchanged(sheet, 'Correção de tipo inválida');
      }
      return standardizeType(sheet, fix.column, fix.to);
    case 'normalize_dates':
      if (typeof fix.column !== 'string' || !DATE_FORMATS.includes(fix.to)) {
        return unchanged(sheet, 'Correção de datas inválida');
      }
      return normalizeDates(sheet, fix.column, fix.to);
    case 'remove_duplicates':
      return removeDuplicates(sheet);
    default:
      return unchanged(sheet, 'Tipo de correção desconhecido');
  }
}

/** Devolve a planilha corrigida (nova); a original permanece intacta para desfazer. */
export function applyHealthFix(sheet: Sheet, fix: HealthFix): Sheet {
  return previewHealthFix(sheet, fix).sheet;
}
