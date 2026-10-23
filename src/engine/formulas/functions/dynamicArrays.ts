// src/engine/formulas/functions/dynamicArrays.ts
// Matrizes dinâmicas (ÚNICO, CLASSIFICAR, SEQUÊNCIA, FILTRO, DIVIDIRTEXTO).

import { parseNumberSafely, valuesMatch } from '../numbers';
import { FunctionHandler } from './types';

const unico: FunctionHandler = (args, ctx) => {
  if (args.length < 1) throw new Error('#VALOR!');
  const res = ctx.resolve(args[0]);
  if (!res) throw new Error('#VALOR!');

  if (res.matrixValues && res.matrixValues[0] && res.matrixValues[0].length > 1) {
    const seen = new Set<string>();
    const uniqueMatrix: any[][] = [];
    for (const row of res.matrixValues) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMatrix.push(row);
      }
    }
    return uniqueMatrix;
  } else {
    const seen = new Set<string>();
    const uniqueVals: any[] = [];
    for (const v of res.flatValues) {
      if (v === null || v === undefined || v === '') continue;
      const s = String(v);
      if (!seen.has(s)) {
        seen.add(s);
        uniqueVals.push(v);
      }
    }
    return uniqueVals.map(v => [v]);
  }
};

const classificar: FunctionHandler = (args, ctx) => {
  if (args.length < 1) throw new Error('#VALOR!');
  const res = ctx.resolve(args[0]);
  if (!res) throw new Error('#VALOR!');

  const sortIndex = args[1] ? Number(ctx.evaluate(args[1])) - 1 : 0;
  const sortOrder = args[2] ? Number(ctx.evaluate(args[2])) : 1;

  if (res.matrixValues && res.matrixValues.length > 0) {
    const sorted = [...res.matrixValues].sort((a, b) => {
      const valA = a[sortIndex];
      const valB = b[sortIndex];
      const numA = parseNumberSafely(valA, true);
      const numB = parseNumberSafely(valB, true);
      if (numA !== null && numB !== null) {
        return sortOrder >= 0 ? numA - numB : numB - numA;
      }
      const strA = String(valA ?? '');
      const strB = String(valB ?? '');
      return sortOrder >= 0 ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    return sorted;
  } else {
    const sorted = [...res.flatValues].sort((a, b) => {
      const numA = parseNumberSafely(a, true);
      const numB = parseNumberSafely(b, true);
      if (numA !== null && numB !== null) {
        return sortOrder >= 0 ? numA - numB : numB - numA;
      }
      return sortOrder >= 0 ? String(a ?? '').localeCompare(String(b ?? '')) : String(b ?? '').localeCompare(String(a ?? ''));
    });
    return sorted.map(v => [v]);
  }
};

const sequencia: FunctionHandler = (args, ctx) => {
  if (args.length < 1) throw new Error('#VALOR!');
  const rows = Math.max(1, Math.min(1000, Number(ctx.evaluate(args[0])) || 1));
  const cols = args[1] ? Math.max(1, Math.min(100, Number(ctx.evaluate(args[1])) || 1)) : 1;
  const start = args[2] ? Number(ctx.evaluate(args[2])) || 1 : 1;
  const step = args[3] ? Number(ctx.evaluate(args[3])) || 1 : 1;

  const seqMatrix: number[][] = [];
  let current = start;
  for (let r = 0; r < rows; r++) {
    const rowArr: number[] = [];
    for (let c = 0; c < cols; c++) {
      rowArr.push(current);
      current += step;
    }
    seqMatrix.push(rowArr);
  }
  return seqMatrix;
};

const dividirtexto: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const text = String(ctx.evaluate(args[0]) ?? '');
  const colDelim = String(ctx.evaluate(args[1]) ?? ',');
  const rowDelim = args[2] ? String(ctx.evaluate(args[2])) : null;

  if (rowDelim) {
    const rowParts = text.split(rowDelim);
    return rowParts.map(r => r.split(colDelim));
  }
  return [text.split(colDelim)];
};

const filtro: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const returnRes = ctx.resolve(args[0]);
  if (!returnRes) throw new Error('#VALOR!');

  const ifEmpty = args[2] !== undefined ? ctx.evaluate(args[2]) : 'Nenhum';
  const conditionExpr = args[1].trim();

  const compMatch = conditionExpr.match(/^(.*?)(<=|>=|<>|=|<|>)(.*)$/);
  if (!compMatch) throw new Error('#VALOR!');

  const leftRangeStr = compMatch[1].trim();
  const op = compMatch[2];
  const rightValExpr = compMatch[3].trim();

  const condRes = ctx.resolve(leftRangeStr);
  if (!condRes) throw new Error('#VALOR!');

  const targetVal = ctx.evaluate(rightValExpr);
  const condVals = condRes.flatValues;
  const returnVals = returnRes.matrixValues && returnRes.matrixValues[0]?.length > 1
    ? returnRes.matrixValues
    : returnRes.flatValues.map(v => [v]);

  const matchedItems: any[][] = [];
  for (let i = 0; i < condVals.length; i++) {
    const v = condVals[i];
    if (v === null || v === undefined) continue;

    let match = false;
    const numV = parseNumberSafely(v);

    if (op === '=') match = valuesMatch(v, targetVal);
    else if (op === '<>') match = !valuesMatch(v, targetVal);
    else if (op === '>') {
      const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
      match = numV !== null && targetNum !== null && numV > targetNum;
    } else if (op === '<') {
      const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
      match = numV !== null && targetNum !== null && numV < targetNum;
    } else if (op === '>=') {
      const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
      match = numV !== null && targetNum !== null && numV >= targetNum;
    } else if (op === '<=') {
      const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
      match = numV !== null && targetNum !== null && numV <= targetNum;
    }

    if (match && returnVals[i] !== undefined) {
      matchedItems.push(returnVals[i]);
    }
  }

  if (matchedItems.length === 0) return [[ifEmpty]];
  return matchedItems;
};

export const DYNAMIC_ARRAY_FUNCTIONS: Record<string, FunctionHandler> = {
  'ÚNICO': unico,
  'UNICO': unico,
  'UNIQUE': unico,
  'CLASSIFICAR': classificar,
  'SORT': classificar,
  'SEQUÊNCIA': sequencia,
  'SEQUENCIA': sequencia,
  'SEQUENCE': sequencia,
  'DIVIDIRTEXTO': dividirtexto,
  'TEXTSPLIT': dividirtexto,
  'FILTRO': filtro,
  'FILTER': filtro,
};
