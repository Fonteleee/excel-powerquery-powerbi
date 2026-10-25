// src/features/agent/tools/common.ts
// Utilitários das ferramentas: leitura segura de argumentos, endereços A1 e escrita de células.

import { CellData, Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel, labelToColIndex, recalculateSheet } from '../../../engine/formulaParser';
import { FlowTable, evaluateTable } from '../../relations/runtime/evaluate';
import { FORBIDDEN_KEYS } from '../../relations/model/graph';
import { Json, ToolOutcome, Workspace } from '../types';

/** Erro de uso da ferramenta: vira uma resposta clara para o modelo corrigir a chamada. */
export class ToolError extends Error {}

export const MAX_ROWS = 100_000;
export const MAX_COLS = 200;
export const MAX_WRITE_CELLS = 5_000;
export const MAX_OUTPUT_CHARS = 6_000;

// ---- Argumentos ------------------------------------------------------------------------------

export function str(args: Record<string, unknown>, key: string, required = true): string {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new ToolError(`Falta o argumento "${key}".`);
    return '';
  }
  if (typeof value !== 'string') throw new ToolError(`O argumento "${key}" deve ser texto.`);
  return value;
}

export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return value === undefined || value === null || value === '' ? undefined : str(args, key);
}

export function num(args: Record<string, unknown>, key: string, fallback?: number): number {
  const value = args[key];
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new ToolError(`Falta o argumento "${key}".`);
  }
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) throw new ToolError(`O argumento "${key}" deve ser um número.`);
  return parsed;
}

export function list(args: Record<string, unknown>, key: string, required = true): unknown[] {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) throw new ToolError(`Falta o argumento "${key}".`);
    return [];
  }
  if (!Array.isArray(value)) throw new ToolError(`O argumento "${key}" deve ser uma lista.`);
  return value;
}

export function strList(args: Record<string, unknown>, key: string, required = true): string[] {
  return list(args, key, required).map((v, i) => {
    if (typeof v !== 'string' || v === '') throw new ToolError(`"${key}[${i}]" deve ser um texto não vazio.`);
    return v;
  });
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ToolError(`${label} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

export function safeName(value: string, label: string): string {
  if (FORBIDDEN_KEYS.has(value)) throw new ToolError(`${label} "${value}" não é permitido.`);
  return value;
}

// ---- Planilhas e colunas ---------------------------------------------------------------------

export function findSheet(ws: Workspace, ref: string): Sheet {
  const wanted = ref.trim().toLowerCase();
  const found =
    ws.sheets.find(s => s.id === ref) ??
    ws.sheets.find(s => s.name.toLowerCase() === wanted) ??
    ws.sheets.find(s => s.name.toLowerCase().startsWith(wanted) && wanted.length >= 3);
  if (!found) {
    const names = ws.sheets.map(s => `"${s.name}"`).join(', ') || '(nenhuma)';
    throw new ToolError(`Planilha "${ref}" não encontrada. Planilhas existentes: ${names}.`);
  }
  return found;
}

export function sheetTable(sheet: Sheet): FlowTable {
  const result = evaluateTable(sheet, sheet.id);
  if (result.error || !result.table) throw new ToolError(result.error ?? 'Não foi possível ler a planilha.');
  return result.table;
}

/** Número de linhas com algum dado (a linha 1 é o cabeçalho). */
export function dataRowCount(sheet: Sheet): number {
  return lastUsedRow(sheet);
}

/** Índice (base 0) da última linha com conteúdo; 0 quando só há cabeçalho ou nada. */
export function lastUsedRow(sheet: Sheet): number {
  let last = 0;
  for (const key of Object.keys(sheet.data)) {
    const cell = sheet.data[key];
    if (cell.raw === '' && (cell.value === '' || cell.value === null || cell.value === undefined)) continue;
    const row = Number(key.slice(1, key.indexOf('C')));
    if (row > last) last = row;
  }
  return last;
}

export function lastUsedCol(sheet: Sheet): number {
  let last = -1;
  for (const key of Object.keys(sheet.data)) {
    const cell = sheet.data[key];
    if (cell.raw === '' && (cell.value === '' || cell.value === null || cell.value === undefined)) continue;
    const col = Number(key.slice(key.indexOf('C') + 1));
    if (col > last) last = col;
  }
  return last;
}

export function headerOf(sheet: Sheet, col: number): string {
  const value = sheet.data[cellPosToKey(0, col)]?.value;
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Aceita nome do cabeçalho (exato ou sem diferenciar maiúsculas) ou letra da coluna ("C"). */
export function columnIndex(sheet: Sheet, ref: string): number {
  const wanted = ref.trim();
  const cols = Math.max(lastUsedCol(sheet) + 1, 0);
  for (let c = 0; c < cols; c++) if (headerOf(sheet, c) === wanted) return c;
  for (let c = 0; c < cols; c++) if (headerOf(sheet, c).toLowerCase() === wanted.toLowerCase()) return c;
  if (/^[A-Za-z]{1,3}$/.test(wanted)) {
    const index = labelToColIndex(wanted.toUpperCase());
    if (index >= 0 && index < MAX_COLS) return index;
  }
  const headers = Array.from({ length: cols }, (_, c) => headerOf(sheet, c)).filter(Boolean).map(h => `"${h}"`);
  throw new ToolError(`Coluna "${ref}" não existe em "${sheet.name}". Colunas: ${headers.join(', ') || '(nenhuma)'}.`);
}

// ---- Endereços A1 ----------------------------------------------------------------------------

export interface Cell0 {
  row: number;
  col: number;
}

export interface Range0 {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** "B2" -> { row: 1, col: 1 }. As linhas do usuário começam em 1; internamente em 0. */
export function parseA1(address: string): Cell0 {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(address.trim());
  if (!match) throw new ToolError(`Endereço "${address}" inválido. Use o formato A1, como B2.`);
  const row = Number(match[2]) - 1;
  const col = labelToColIndex(match[1].toUpperCase());
  if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) {
    throw new ToolError(`Endereço "${address}" fora dos limites (${MAX_ROWS} linhas, ${MAX_COLS} colunas).`);
  }
  return { row, col };
}

export function parseRange(address: string): Range0 {
  const [a, b] = address.split(':');
  const start = parseA1(a);
  const end = parseA1(b ?? a);
  return {
    r0: Math.min(start.row, end.row),
    c0: Math.min(start.col, end.col),
    r1: Math.max(start.row, end.row),
    c1: Math.max(start.col, end.col),
  };
}

export const toA1 = (row: number, col: number): string => `${colIndexToLabel(col)}${row + 1}`;

// ---- Escrita ---------------------------------------------------------------------------------

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Converte o valor vindo do modelo em célula: "=..." vira fórmula, número vira número, o resto é texto. */
export function toCell(input: unknown): CellData {
  if (input === null || input === undefined || input === '') return { raw: '', value: '' };
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new ToolError('Número inválido.');
    return { raw: String(input), value: input };
  }
  if (typeof input === 'boolean') return { raw: input ? 'VERDADEIRO' : 'FALSO', value: input };
  if (typeof input !== 'string') throw new ToolError('Cada célula deve ser texto, número, booleano ou vazio.');
  if (input.length > 5_000) throw new ToolError('Texto de célula longo demais (máximo 5000 caracteres).');
  if (input.startsWith('=')) return { raw: input, value: '' };
  if (PLAIN_NUMBER.test(input.trim())) return { raw: input.trim(), value: Number(input.trim()) };
  return { raw: input, value: input };
}

/** Cópia da planilha com a célula gravada e as dimensões ampliadas se preciso. */
export function withCell(sheet: Sheet, row: number, col: number, cell: CellData): Sheet {
  const next: Sheet = {
    ...sheet,
    data: { ...sheet.data },
    rowCount: Math.max(sheet.rowCount, row + 1),
    colCount: Math.max(sheet.colCount, col + 1),
  };
  const key = cellPosToKey(row, col);
  const previous = sheet.data[key];
  if (cell.raw === '') {
    if (previous?.format) next.data[key] = { raw: '', value: '', format: previous.format };
    else delete next.data[key];
  } else {
    next.data[key] = { ...cell, format: cell.format ?? previous?.format };
  }
  return next;
}

/** Aplica vários ajustes e recalcula a planilha com todas as outras (referências entre abas). */
export function commitSheet(ws: Workspace, updated: Sheet): Workspace {
  const sheets = ws.sheets.map(s => (s.id === updated.id ? updated : s));
  const recalculated = recalculateSheet(updated, sheets);
  return { ...ws, sheets: sheets.map(s => (s.id === updated.id ? recalculated : s)) };
}

/** Recalcula todas as planilhas depois de uma mudança que pode afetar referências cruzadas. */
export function recalcAll(ws: Workspace): Workspace {
  let sheets = ws.sheets;
  for (const sheet of ws.sheets) {
    const recalculated = recalculateSheet(sheet, sheets);
    sheets = sheets.map(s => (s.id === sheet.id ? recalculated : s));
  }
  return { ...ws, sheets };
}

export function uniqueSheetName(ws: Workspace, wanted: string, ignoreId?: string): string {
  const base = wanted.trim().slice(0, 64) || 'Planilha';
  const taken = new Set(ws.sheets.filter(s => s.id !== ignoreId).map(s => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

export function uniqueSheetId(ws: Workspace, prefix: string): string {
  const taken = new Set(ws.sheets.map(s => s.id));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

// ---- Saída -----------------------------------------------------------------------------------

export const ok = (message: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({ ok: true, message, ...extra });
export const fail = (message: string): ToolOutcome => ({ ok: false, message });

export function clip(text: string, max = MAX_OUTPUT_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (truncado: ${text.length - max} caracteres a mais)`;
}

export const jsonCell = (value: unknown): string | number | boolean | null =>
  value === null || value === undefined || value === '' ? null : typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean);

export const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;
