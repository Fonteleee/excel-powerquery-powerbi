// src/engine/formulas/evaluator.ts
// Avaliador de expressões e fórmulas (texto -> valor) e leitura de células/intervalos.
// As funções de planilha ficam em ./functions/*; este módulo só orquestra operadores e referências.

import { CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, parseCellAddress, parseRangeAddress } from './addressing';
import { findFunction } from './functions';
import { FunctionContext, ResolvedRange } from './functions/types';
import { parseNumberSafely } from './numbers';
import { activeSession } from './session';
import {
  hasTopLevelOperator,
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
    if (!session || !formula || session.isFresh(sheet.id, key)) return cell.value;
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

// Main Expression Evaluator
function evaluateExpression(
  expr: string,
  sheet: Sheet,
  allSheets: Sheet[],
  callStack: Set<string>
): any {
  expr = expr.trim();
  if (!expr) return '';

  // Handle outer parentheses: (1 - I2) or ((A1+B1)*2)
  if (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let canStrip = true;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      if (depth === 0) {
        canStrip = false;
        break;
      }
    }
    if (canStrip) {
      return evaluateExpression(expr.substring(1, expr.length - 1).trim(), sheet, allSheets, callStack);
    }
  }

  // Check function call: FUNC(arg1, arg2, ...)
  const funcMatch = expr.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ._]+)\s*\((.*)\)$/i);
  if (funcMatch) {
    const funcName = funcMatch[1].toUpperCase();
    const argsRaw = funcMatch[2];
    const args = splitFormulaArguments(argsRaw);

    return executeFunction(funcName, args, makeContext(sheet, allSheets, callStack));
  }


  // Handle concatenation with & operator
  if (hasTopLevelOperator(expr, '&')) {
    const tokens = splitByTopLevelOperator(expr, '&');
    return tokens
      .map(t => {
        const res = evaluateExpression(t, sheet, allSheets, callStack);
        return res === null || res === undefined ? '' : String(res);
      })
      .join('');
  }

  // Handle comparison operators: =, <>, <=, >=, <, >
  const compOps = ['<=', '>=', '<>', '=', '<', '>'];
  for (const op of compOps) {
    if (hasTopLevelOperator(expr, op)) {
      const parts = splitByTopLevelOperator(expr, op);
      if (parts.length === 2) {
        const left = evaluateExpression(parts[0], sheet, allSheets, callStack);
        const right = evaluateExpression(parts[1], sheet, allSheets, callStack);
        if (op === '=') return left === right;
        if (op === '<>') return left !== right;
        if (op === '<') return Number(left) < Number(right);
        if (op === '>') return Number(left) > Number(right);
        if (op === '<=') return Number(left) <= Number(right);
        if (op === '>=') return Number(left) >= Number(right);
      }
    }
  }

  // Handle arithmetic: +, -
  if (hasTopLevelOperator(expr, '+') || hasTopLevelOperator(expr, '-')) {
    const parts = splitAdditive(expr);
    let total = 0;
    for (const part of parts) {
      const val = evaluateExpression(part.expr, sheet, allSheets, callStack);
      const num = Number(val);
      if (isNaN(num)) throw new Error('#VALOR!');
      if (part.sign === '+') total += num;
      else total -= num;
    }
    return total;
  }

  // Handle arithmetic: *, /
  if (hasTopLevelOperator(expr, '*') || hasTopLevelOperator(expr, '/')) {
    const parts = splitMultiplicative(expr);
    let total = 1;
    for (let i = 0; i < parts.length; i++) {
      const val = evaluateExpression(parts[i].expr, sheet, allSheets, callStack);
      const num = Number(val);
      if (isNaN(num)) throw new Error('#VALOR!');
      if (i === 0) {
        total = num;
      } else {
        if (parts[i].op === '*') {
          total *= num;
        } else {
          if (num === 0) throw new Error('#DIV/0!');
          total /= num;
        }
      }
    }
    return total;
  }

  // Handle string literals "Hello"
  if (expr.startsWith('"') && expr.endsWith('"') && expr.length >= 2) {
    return expr.substring(1, expr.length - 1);
  }

  // Handle boolean literals
  if (expr.toUpperCase() === 'VERDADEIRO' || expr.toUpperCase() === 'TRUE') return true;
  if (expr.toUpperCase() === 'FALSO' || expr.toUpperCase() === 'FALSE') return false;

  // Handle sheet qualified reference "Sheet2!A1" or "'Acompanhamento de Pagamentos'!A1:B10" or "Acompanhamento!B5"

  if (expr.includes('!')) {
    const exclamationIdx = expr.indexOf('!');
    const rawSheetName = expr.substring(0, exclamationIdx).trim().replace(/^'|'$/g, '');
    const cellRef = expr.substring(exclamationIdx + 1).trim();

    const clean = rawSheetName.toUpperCase().replace(/\.+$/, '');
    const targetSheet = allSheets.find(s => {
      const sName = s.name.toUpperCase();
      return sName === rawSheetName.toUpperCase() || sName.startsWith(clean) || clean.startsWith(sName);
    }) || sheet;

    return evaluateExpression(cellRef, targetSheet, allSheets, callStack);
  }


  // Handle cell range "A1:B10"
  const range = parseRangeAddress(expr, sheet.rowCount);
  if (range && (range.startRow !== range.endRow || range.startCol !== range.endCol)) {
    return getRangeValues(sheet, range);
  }

  // Handle single cell "A1"
  const cellPos = parseCellAddress(expr);
  if (cellPos) {
    const cellKey = cellPosToKey(cellPos.row, cellPos.col);
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

  // Number literal
  const num = parseNumberSafely(expr);
  if (num !== null) return num;

  return expr;
}
