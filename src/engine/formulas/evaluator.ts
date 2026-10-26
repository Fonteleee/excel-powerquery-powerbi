// src/engine/formulas/evaluator.ts
// Avaliador de expressões e fórmulas (texto -> valor) e leitura de células/intervalos.
// As funções de planilha ficam em ./functions/*; este módulo só orquestra operadores e referências.

import { CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, parseCellAddress, parseRangeAddress } from './addressing';
import { findFunction } from './functions';
import { FunctionContext, ResolvedRange } from './functions/types';
import { Host } from '../xl/call';
import { evaluateText } from '../xl/interp';
import { Matrix, Scalar, XlError } from '../xl/values';
import { parseNumberSafely } from './numbers';
import { activeSession } from './session';
import {
  OP,
  scanTopLevelOperators,
  splitAdditive,
  splitByTopLevelOperator,
  splitFormulaArguments,
  splitMultiplicative,
} from './tokenizer';

export type { ResolvedRange };

const isFormulaCell = (raw: unknown): boolean => typeof raw === 'string' && raw.startsWith('=');

// Get cell value from sheet with automatic formula evaluation resolution
export function getCellValue(
  sheet: Sheet,
  row: number,
  col: number,
  allSheets: Sheet[] = [sheet],
  callStack: Set<string> = new Set()
): any {
  const key = cellPosToKey(row, col);
  const cell = sheet.data[key];
  if (!cell) return null;
  const session = activeSession();
  const formula = isFormulaCell(cell.raw);
  if (cell.value !== undefined && cell.value !== null) {
    // Em recálculo, o valor de uma fórmula "suja" ainda não recalculada não é confiável.
    if (!session || !formula || !session.isPending(sheet.id, key)) return cell.value;
  }
  if (formula) {
    if (callStack.has(`${sheet.id}:${key}`)) return 0;
    const nextStack = new Set(callStack);
    nextStack.add(`${sheet.id}:${key}`);
    try {
      const val = evaluateFormula(cell.raw, sheet, allSheets, nextStack);
      // Motor antigo: grava o resultado na própria célula. Em sessão, o cache é da sessão (sem mutar o chamador).
      if (!session) cell.value = val;
      return val;
    } catch {
      return 0;
    }
  }
  return cell.raw;
}

// Get array of cell values in range
export function getRangeValues(sheet: Sheet, range: CellRange): any[][] {
  const matrix: any[][] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const rowVals: any[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      rowVals.push(getCellValue(sheet, r, c));
    }
    matrix.push(rowVals);
  }
  return matrix;
}

// Flatten range values
export function getFlatRangeValues(sheet: Sheet, range: CellRange): any[] {
  const flat: any[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const val = getCellValue(sheet, r, c);
      flat.push(val);
    }
  }
  return flat;
}

/** Encontra a aba citada numa referência ("Dados", "'Planilha 2'", "Acompanhamento de Pa..."). */
export function findSheetByReferenceName(rawName: string, allSheets: Sheet[]): Sheet | undefined {
  const normalize = (s: string) => s.toUpperCase().replace(/[\s\-_]/g, '').replace(/\.+$/, '');
  const cleanRaw = normalize(rawName);
  return allSheets.find(s => {
    const sClean = normalize(s.name);
    return sClean === cleanRaw || sClean.startsWith(cleanRaw) || cleanRaw.startsWith(sClean);
  });
}

// Resolve a range argument which might be local ("A1:B10") or cross-sheet ("'Acompanhamento'!A1:B10", "Acompanhamento!B:B", "'Planilha 2'!C5")
export function resolveRangeAndValues(
  arg: string,
  currentSheet: Sheet,
  allSheets: Sheet[] = [currentSheet]
): ResolvedRange | null {
  const trimmed = arg.trim();
  let targetSheet = currentSheet;
  let address = trimmed;

  if (trimmed.includes('!')) {
    const exclamationIdx = trimmed.indexOf('!');
    const rawSheetName = trimmed.substring(0, exclamationIdx).trim().replace(/^'|'$/g, '').replace(/''/g, "'");
    address = trimmed.substring(exclamationIdx + 1).trim();
    const found = findSheetByReferenceName(rawSheetName, allSheets);
    if (found) {
      targetSheet = found;
    }
  }

  const range = parseRangeAddress(address, targetSheet.rowCount);
  if (!range) return null;

  const session = activeSession();
  let entry: { flat?: any[]; matrix?: any[][] } = {};
  if (session) {
    const cacheKey = `${targetSheet.id}|${range.startRow}|${range.startCol}|${range.endRow}|${range.endCol}`;
    const cached = session.rangeCache.get(cacheKey);
    if (cached) {
      session.stats.rangeHits++;
      entry = cached;
    } else {
      session.stats.rangeMisses++;
      session.rangeCache.set(cacheKey, entry);
    }
  }

  return {
    targetSheet,
    range,
    get flatValues() {
      return (entry.flat ??= getFlatRangeValues(targetSheet, range));
    },
    get matrixValues() {
      return (entry.matrix ??= getRangeValues(targetSheet, range));
    },
  };
}

function makeContext(sheet: Sheet, allSheets: Sheet[], callStack: Set<string>): FunctionContext {
  return {
    sheet,
    allSheets,
    evaluate: expr => evaluateExpression(expr, sheet, allSheets, callStack),
    resolve: arg => resolveRangeAndValues(arg, sheet, allSheets),
    getCell: (target, row, col) => getCellValue(target, row, col),
  };
}

function executeFunction(name: string, args: string[], ctx: FunctionContext): any {
  const handler = findFunction(name.toUpperCase());
  if (!handler) throw new Error('#NOME?');
  return handler(args, ctx);
}


// Evaluate formula
export function evaluateFormula(

  formula: string,
  sheet: Sheet,
  allSheets: Sheet[] = [sheet],
  callStack: Set<string> = new Set()
): any {
  if (!formula.startsWith('=')) {
    const num = parseNumberSafely(formula);
    return num !== null ? num : formula;
  }


  const expr = formula.substring(1).trim();

  try {
    return evaluateExpression(expr, sheet, allSheets, callStack);
  } catch (err: any) {
    if (err.message && err.message.startsWith('#')) return err.message;
    return '#VALOR!';
  }
}

const CELL_ONLY = /^\$?[A-Za-z]{1,3}\$?\d+$/;
const NUMBER_ONLY = /^\d+(\.\d+)?$/;

/** Valor de uma referência simples a célula (A1): constante, ou fórmula (em cache dentro de um recálculo). */
function readCellReference(row: number, col: number, sheet: Sheet, allSheets: Sheet[], callStack: Set<string>): any {
  const cellKey = cellPosToKey(row, col);
  if (callStack.has(`${sheet.id}:${cellKey}`)) {
    throw new Error('#CIRCULAR!');
  }
  const cell = sheet.data[cellKey];
  if (!cell) return 0;
  if (cell.raw && cell.raw.startsWith('=')) {
    // Dentro de um recálculo, usa o valor já calculado quando ele é confiável (evita recursão O(n²)).
    const session = activeSession();
    if (session && cell.value !== undefined && cell.value !== null && session.isFresh(sheet.id, cellKey)) {
      return cell.value;
    }
    const nextStack = new Set(callStack);
    nextStack.add(`${sheet.id}:${cellKey}`);
    return evaluateFormula(cell.raw, sheet, allSheets, nextStack);
  }
  const num = parseNumberSafely(cell.value ?? cell.raw);
  return num !== null ? num : (cell.value ?? cell.raw ?? 0);
}

// Avaliador de expressões: o texto é analisado por ../xl (precedência do Excel, matrizes, erros como valores)
// e as funções vêm da biblioteca nativa de ../xl/lib ou, quando só existem lá, das funções de ./functions.

/** Valor de uma célula para o novo avaliador: vazio é null (não 0); texto numérico vira número. */
function readCellValue(row: number, col: number, sheet: Sheet, allSheets: Sheet[], callStack: Set<string>): Scalar {
  const cellKey = cellPosToKey(row, col);
  const cell = sheet.data[cellKey];
  if (!cell) return null;
  if (callStack.has(`${sheet.id}:${cellKey}`)) throw new Error('#CIRCULAR!');
  if (cell.raw && cell.raw.startsWith('=')) {
    const session = activeSession();
    if (session && cell.value !== undefined && cell.value !== null && session.isFresh(sheet.id, cellKey)) return cell.value as Scalar;
    const nextStack = new Set(callStack);
    nextStack.add(`${sheet.id}:${cellKey}`);
    return evaluateFormula(cell.raw, sheet, allSheets, nextStack);
  }
  const raw = cell.value ?? cell.raw;
  if (raw === '' || raw === undefined || raw === null) return null;
  const num = parseNumberSafely(raw);
  return num !== null ? num : (raw as Scalar);
}

const LEADING_ZERO_CODE = /^0\d+$/;

/** Intervalo como matriz. Células em andamento (a própria fórmula) contam como vazias; texto numérico vira número. */
function readRangeValues(sheet: Sheet, range: CellRange, allSheets: Sheet[], callStack: Set<string>): Matrix {
  // Dentro de um recálculo o intervalo é lido uma única vez por rodada (colunas inteiras são caras).
  const session = activeSession();
  if (session) {
    const cacheKey = `${sheet.id}|${range.startRow}|${range.startCol}|${range.endRow}|${range.endCol}`;
    let entry = session.rangeCache.get(cacheKey);
    if (!entry) {
      entry = {};
      session.rangeCache.set(cacheKey, entry);
    }
    return (entry.xl ??= buildRangeMatrix(sheet, range, allSheets, callStack));
  }
  return buildRangeMatrix(sheet, range, allSheets, callStack);
}

function buildRangeMatrix(sheet: Sheet, range: CellRange, allSheets: Sheet[], callStack: Set<string>): Matrix {
  const out: Matrix = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const row: Scalar[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      if (callStack.has(`${sheet.id}:${cellPosToKey(r, c)}`)) {
        row.push(null);
        continue;
      }
      const v = getCellValue(sheet, r, c, allSheets, callStack);
      if (typeof v === 'string' && v !== '' && !LEADING_ZERO_CODE.test(v.trim())) {
        const n = parseNumberSafely(v);
        row.push(n !== null ? n : v);
      } else row.push(v === undefined ? null : (v as Scalar));
    }
    out.push(row);
  }
  return out;
}

function makeHost(sheet: Sheet, allSheets: Sheet[], callStack: Set<string>): Host {
  const legacyContext = makeContext(sheet, allSheets, callStack);
  return {
    sheet,
    allSheets,
    resolveSheet: name => findSheetByReferenceName(name, allSheets),
    readCell: (s, row, col) => readCellValue(row, col, s, allSheets, callStack),
    readRange: (s, range) => readRangeValues(s, range, allSheets, callStack),
    parseRange: (address, s) => parseRangeAddress(address, s.rowCount),
    legacy: (name, args) => {
      const handler = findFunction(name);
      return handler ? { found: true, value: handler(args, legacyContext) } : { found: false };
    },
  };
}

function evaluateExpression(expr: string, sheet: Sheet, allSheets: Sheet[], callStack: Set<string>): any {
  expr = expr.trim();
  if (!expr) return '';
  try {
    return evaluateText(expr, makeHost(sheet, allSheets, callStack));
  } catch (error) {
    if (error instanceof XlError) throw new Error(error.code);
    throw error;
  }
}
