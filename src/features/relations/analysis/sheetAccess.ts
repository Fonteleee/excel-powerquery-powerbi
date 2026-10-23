// src/features/relations/analysis/sheetAccess.ts
// Leitura de planilhas para as análises (saúde dos dados, conexões fantasma): colunas, células e tipos.

import { cellPosToKey, parseNumberSafely } from '../../../engine/formulaParser';
import { getColumnHeaderName } from '../../../engine/relationFormulaEngine';
import { Sheet } from '../../../types/spreadsheet';
import { FORBIDDEN_KEYS } from '../model/graph';
import { CellKind } from './healthTypes';
import { parseDateText } from './dates';

export type RawValue = string | number | boolean | null | undefined;

export interface SheetColumn {
  index: number;
  header: string;
}

export const isFilled = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

export function cellValue(sheet: Sheet, row: number, col: number): RawValue {
  return sheet.data[cellPosToKey(row, col)]?.value;
}

export function isFormulaCell(sheet: Sheet, row: number, col: number): boolean {
  const raw = sheet.data[cellPosToKey(row, col)]?.raw;
  return typeof raw === 'string' && raw.startsWith('=');
}

/** Mesma regra do motor: entra a coluna com cabeçalho explícito ou com algum dado. */
export function listColumns(sheet: Sheet): SheetColumn[] {
  const columns: SheetColumn[] = [];
  for (let c = 0; c < sheet.colCount; c++) {
    let keep = isFilled(cellValue(sheet, 0, c));
    for (let r = 1; r < sheet.rowCount && !keep; r++) keep = isFilled(cellValue(sheet, r, c));
    if (keep) columns.push({ index: c, header: getColumnHeaderName(sheet, c) });
  }
  return columns;
}

/** Índices das linhas (>= 1) que têm algum dado nas colunas dadas. */
export function dataRowIndexes(sheet: Sheet, columns: readonly SheetColumn[]): number[] {
  const rows: number[] = [];
  for (let r = 1; r < sheet.rowCount; r++) {
    if (columns.some(col => isFilled(cellValue(sheet, r, col.index)))) rows.push(r);
  }
  return rows;
}

export function isForbiddenHeader(header: string): boolean {
  return FORBIDDEN_KEYS.has(header);
}

/** Texto sem espaços nas pontas e sem espaços repetidos. */
export function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s{2,}/g, ' ');
}

export function hasExtraSpaces(value: RawValue): boolean {
  return typeof value === 'string' && value.length > 0 && normalizeSpaces(value) !== value;
}

/** Vazio = nulo, indefinido, '' ou só espaços. */
export function isBlank(value: RawValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export function classifyValue(value: RawValue): CellKind | null {
  if (isBlank(value)) return null;
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isNaN(value) ? null : 'number';
  const text = String(value);
  if (parseDateText(text)) return 'date';
  return parseNumberSafely(text) !== null ? 'numericText' : 'text';
}
