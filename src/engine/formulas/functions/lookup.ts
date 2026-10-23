// src/engine/formulas/functions/lookup.ts
// Busca e referência (PROCX, PROCV, ÍNDICE, CORRESP).

import { valuesMatch } from '../numbers';
import { FunctionHandler } from './types';
import { firstColumnOf, indexFor } from './valueIndex';

/** Primeiro índice de items que casa com 	arget (-1 se nenhum), usando índice quando há sessão. */
function firstMatch(items: readonly unknown[], target: unknown): number {
  const index = indexFor(items);
  if (index) {
    const hit = index.first(target);
    if (hit !== null) return hit;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item !== null && item !== undefined && valuesMatch(item, target)) return i;
  }
  return -1;
}

const procx: FunctionHandler = (args, ctx) => {
  if (args.length < 3) throw new Error('#N/D');
  const lookupVal = ctx.evaluate(args[0]);
  
  // Evaluate lookup array (supports cross-sheet 'Acompanhamento'!A:A)
  const lookupRes = ctx.resolve(args[1]);
  const returnRes = ctx.resolve(args[2]);
  const ifNotFound = args[3] !== undefined ? ctx.evaluate(args[3]) : '#N/D';

  if (!lookupRes || !returnRes) throw new Error('#VALOR!');

  const lookupItems = lookupRes.flatValues;
  const returnItems = returnRes.flatValues;

  const matchIndex = firstMatch(lookupItems, lookupVal);

  if (matchIndex >= 0 && matchIndex < returnItems.length) {
    return returnItems[matchIndex];
  }
  return ifNotFound;
};

const procv: FunctionHandler = (args, ctx) => {
  if (args.length < 3) throw new Error('#VALOR!');
  const lookupVal = ctx.evaluate(args[0]);
  const tableRes = ctx.resolve(args[1]);
  if (!tableRes) throw new Error('#VALOR!');
  const colIdx = Number(ctx.evaluate(args[2]));
  if (isNaN(colIdx) || colIdx < 1 || colIdx > (tableRes.range.endCol - tableRes.range.startCol + 1)) {
    throw new Error('#REF!');
  }

  const matrix = tableRes.matrixValues;
  const row = firstMatch(firstColumnOf(matrix), lookupVal);
  if (row >= 0) return matrix[row][colIdx - 1];
  throw new Error('#N/D');
};

const indice: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const resolved = ctx.resolve(args[0]);
  if (!resolved) throw new Error('#REF!');
  const rowNum = Number(ctx.evaluate(args[1]));
  const colNum = args[2] ? Number(ctx.evaluate(args[2])) : 1;

  if (isNaN(rowNum) || rowNum < 1) throw new Error('#REF!');
  const targetRow = resolved.range.startRow + (rowNum - 1);
  const targetCol = resolved.range.startCol + (colNum - 1);

  if (targetRow > resolved.range.endRow || targetCol > resolved.range.endCol) throw new Error('#REF!');
  return ctx.getCell(resolved.targetSheet, targetRow, targetCol);
};

const corresp: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const lookupVal = ctx.evaluate(args[0]);
  const resolved = ctx.resolve(args[1]);
  if (!resolved) throw new Error('#VALOR!');

  const hit = firstMatch(resolved.flatValues, lookupVal);
  if (hit >= 0) return hit + 1; // 1-based index
  throw new Error('#N/D');
};

export const LOOKUP_FUNCTIONS: Record<string, FunctionHandler> = {
  'PROCX': procx,
  'XLOOKUP': procx,
  'PROCV': procv,
  'VLOOKUP': procv,
  'ÍNDICE': indice,
  'INDICE': indice,
  'INDEX': indice,
  'CORRESP': corresp,
  'MATCH': corresp,
};
