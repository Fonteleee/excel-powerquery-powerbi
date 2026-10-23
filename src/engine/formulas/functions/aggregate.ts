// src/engine/formulas/functions/aggregate.ts
// Agregação e estatística (SOMA, MÉDIA, CONT.SE, SOMASE...).

import { parseNumberSafely, valuesMatch } from '../numbers';
import { FunctionHandler } from './types';
import { indexFor } from './valueIndex';

/**
 * Critério de IGUALDADE (sem operador ou com =): índices dos itens que casam, em ordem crescente.
 * 
ull quando não dá para indexar (sem sessão de recálculo, operador de comparação ou curingas):
 * o chamador então varre o vetor como sempre.
 */
function equalityHits(values: readonly unknown[], criteriaRaw: unknown, criteriaStr: string): number[] | null {
  if (/^(>=|<=|<>|>|<)/.test(criteriaStr)) return null;
  const index = indexFor(values);
  if (!index) return null;
  return index.matches(criteriaStr.startsWith('=') ? criteriaStr.substring(1) : criteriaRaw);
}

const somarproduto: FunctionHandler = (args, ctx) => {
  if (args.length === 0) return 0;
  const arrays: number[][] = [];
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      const vals = resolved.flatValues.map(v => {
        const n = parseNumberSafely(v);
        return n !== null ? n : 0;
      });
      arrays.push(vals);
    } else {
      const val = ctx.evaluate(arg);
      arrays.push([Number(val) || 0]);
    }
  }

  if (arrays.length === 0) return 0;
  const len = arrays[0].length;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    let prod = 1;
    for (const arr of arrays) {
      prod *= arr[i] !== undefined ? arr[i] : 0;
    }
    sum += prod;
  }
  return sum;
};

const mediaPonderada: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const valRes = ctx.resolve(args[0]);
  const weightRes = ctx.resolve(args[1]);

  if (!valRes || !weightRes) throw new Error('#VALOR!');
  const vals = valRes.flatValues.map(v => parseNumberSafely(v) ?? 0);
  const weights = weightRes.flatValues.map(w => parseNumberSafely(w) ?? 0);

  let sumProd = 0;
  let sumWeight = 0;
  const minLen = Math.min(vals.length, weights.length);

  for (let i = 0; i < minLen; i++) {
    sumProd += vals[i] * weights[i];
    sumWeight += weights[i];
  }

  if (sumWeight === 0) throw new Error('#DIV/0!');
  return sumProd / sumWeight;
};

const mediase: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const rangeRes = ctx.resolve(args[0]);
  if (!rangeRes) throw new Error('#VALOR!');
  const criteriaRaw = ctx.evaluate(args[1]);
  const criteriaStr = String(criteriaRaw).trim();

  const avgRes = args[2] ? ctx.resolve(args[2]) : rangeRes;
  const rangeVals = rangeRes.flatValues;
  const avgVals = avgRes ? avgRes.flatValues : rangeVals;

  let total = 0;
  let count = 0;
  const hits = equalityHits(rangeVals, criteriaRaw, criteriaStr);
  if (hits) {
    for (const i of hits) {
      if (avgVals[i] === undefined) continue;
      const n = parseNumberSafely(avgVals[i], true);
      if (n !== null) {
        total += n;
        count++;
      }
    }
    if (count === 0) throw new Error('#DIV/0!');
    return total / count;
  }
  for (let i = 0; i < rangeVals.length; i++) {
    const v = rangeVals[i];
    if (v === null || v === undefined) continue;

    let match = false;
    const numV = parseNumberSafely(v);

    if (criteriaStr.startsWith('>=')) {
      const target = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      match = numV !== null && numV >= target;
    } else if (criteriaStr.startsWith('<=')) {
      const target = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      match = numV !== null && numV <= target;
    } else if (criteriaStr.startsWith('<>')) {
      match = !valuesMatch(v, criteriaStr.substring(2));
    } else if (criteriaStr.startsWith('>')) {
      const target = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      match = numV !== null && numV > target;
    } else if (criteriaStr.startsWith('<')) {
      const target = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      match = numV !== null && numV < target;
    } else if (criteriaStr.startsWith('=')) {
      match = valuesMatch(v, criteriaStr.substring(1));
    } else {
      match = valuesMatch(v, criteriaRaw);
    }

    if (match && avgVals[i] !== undefined) {
      const n = parseNumberSafely(avgVals[i], true);
      if (n !== null) {
        total += n;
        count++;
      }
    }
  }
  if (count === 0) throw new Error('#DIV/0!');
  return total / count;
};

const soma: FunctionHandler = (args, ctx) => {
  let sum = 0;
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        const n = parseNumberSafely(v, true);
        if (n !== null) sum += n;
      });
    } else {
      const v = ctx.evaluate(arg);
      const n = parseNumberSafely(v, true);
      if (n !== null) sum += n;
    }
  }
  return sum;
};

const media: FunctionHandler = (args, ctx) => {
  let sum = 0;
  let count = 0;
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        const n = parseNumberSafely(v, true);
        if (n !== null) {
          sum += n;
          count++;
        }
      });
    } else {
      const v = ctx.evaluate(arg);
      const n = parseNumberSafely(v, true);
      if (n !== null) {
        sum += n;
        count++;
      }
    }
  }
  if (count === 0) throw new Error('#DIV/0!');
  return sum / count;
};

const contSe: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const resolved = ctx.resolve(args[0]);
  if (!resolved) throw new Error('#VALOR!');
  const criteriaRaw = ctx.evaluate(args[1]);
  const criteriaStr = String(criteriaRaw).trim();

  const vals = resolved.flatValues;
  let count = 0;
  const hits = equalityHits(vals, criteriaRaw, criteriaStr);
  if (hits) return hits.length;

  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const numV = parseNumberSafely(v);

    if (criteriaStr.startsWith('>=')) {
      const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      if (numV !== null && numV >= num) count++;
    } else if (criteriaStr.startsWith('<=')) {
      const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      if (numV !== null && numV <= num) count++;
    } else if (criteriaStr.startsWith('<>')) {
      if (!valuesMatch(v, criteriaStr.substring(2))) count++;
    } else if (criteriaStr.startsWith('>')) {
      const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      if (numV !== null && numV > num) count++;
    } else if (criteriaStr.startsWith('<')) {
      const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      if (numV !== null && numV < num) count++;
    } else if (criteriaStr.startsWith('=')) {
      if (valuesMatch(v, criteriaStr.substring(1))) count++;
    } else {
      if (valuesMatch(v, criteriaRaw)) count++;
    }
  }
  return count;
};

const somase: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const rangeRes = ctx.resolve(args[0]);
  if (!rangeRes) throw new Error('#VALOR!');
  const criteriaRaw = ctx.evaluate(args[1]);
  const criteriaStr = String(criteriaRaw).trim();

  const sumRes = args[2] ? ctx.resolve(args[2]) : rangeRes;
  const rangeVals = rangeRes.flatValues;
  const sumVals = sumRes ? sumRes.flatValues : rangeVals;

  let total = 0;
  const hits = equalityHits(rangeVals, criteriaRaw, criteriaStr);
  if (hits) {
    for (const i of hits) {
      if (sumVals[i] === undefined) continue;
      const n = parseNumberSafely(sumVals[i], true);
      if (n !== null) total += n;
    }
    return total;
  }
  for (let i = 0; i < rangeVals.length; i++) {
    const v = rangeVals[i];
    if (v === null || v === undefined) continue;
    let match = false;
    const numV = parseNumberSafely(v);

    if (criteriaStr.startsWith('>=')) {
      const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      match = numV !== null && numV >= num;
    } else if (criteriaStr.startsWith('<=')) {
      const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
      match = numV !== null && numV <= num;
    } else if (criteriaStr.startsWith('<>')) {
      match = !valuesMatch(v, criteriaStr.substring(2));
    } else if (criteriaStr.startsWith('>')) {
      const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      match = numV !== null && numV > num;
    } else if (criteriaStr.startsWith('<')) {
      const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
      match = numV !== null && numV < num;
    } else if (criteriaStr.startsWith('=')) {
      match = valuesMatch(v, criteriaStr.substring(1));
    } else {
      match = valuesMatch(v, criteriaRaw);
    }

    if (match && sumVals[i] !== undefined) {
      const n = parseNumberSafely(sumVals[i], true);
      if (n !== null) total += n;
    }
  }
  return total;
};

const contValores: FunctionHandler = (args, ctx) => {
  let count = 0;
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        if (v !== null && v !== undefined && v !== '') count++;
      });
    } else {
      const v = ctx.evaluate(arg);
      if (v !== null && v !== undefined && v !== '') count++;
    }
  }
  return count;
};

const maximo: FunctionHandler = (args, ctx) => {
  let max = -Infinity;
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        const n = parseNumberSafely(v);
        if (n !== null && n > max) max = n;
      });
    } else {
      const v = Number(ctx.evaluate(arg));
      if (!isNaN(v) && v > max) max = v;
    }
  }
  return max === -Infinity ? 0 : max;
};

const minimo: FunctionHandler = (args, ctx) => {
  let min = Infinity;
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        const n = parseNumberSafely(v);
        if (n !== null && n < min) min = n;
      });
    } else {
      const v = Number(ctx.evaluate(arg));
      if (!isNaN(v) && v < min) min = v;
    }
  }
  return min === Infinity ? 0 : min;
};

export const AGGREGATE_FUNCTIONS: Record<string, FunctionHandler> = {
  'SOMARPRODUTO': somarproduto,
  'SUMPRODUCT': somarproduto,
  'MÉDIA.PONDERADA': mediaPonderada,
  'MEDIA.PONDERADA': mediaPonderada,
  'WEIGHTED.AVERAGE': mediaPonderada,
  'MÉDIASE': mediase,
  'MEDIASE': mediase,
  'AVERAGEIF': mediase,
  'SOMA': soma,
  'SUM': soma,
  'MÉDIA': media,
  'MEDIA': media,
  'AVERAGE': media,
  'CONT.SE': contSe,
  'CONTAR.SE': contSe,
  'COUNTIF': contSe,
  'SOMASE': somase,
  'SUMIF': somase,
  'CONT.VALORES': contValores,
  'CONTAR.VALORES': contValores,
  'COUNTA': contValores,
  'MÁXIMO': maximo,
  'MAXIMO': maximo,
  'MAX': maximo,
  'MÍNIMO': minimo,
  'MINIMO': minimo,
  'MIN': minimo,
};
