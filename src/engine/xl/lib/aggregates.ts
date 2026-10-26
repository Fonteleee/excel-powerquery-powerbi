// src/engine/xl/lib/aggregates.ts
// SOMA, MÉDIA, MÁXIMO, MÍNIMO e SOMARPRODUTO quando o argumento é uma expressão (matriz calculada), como
// SOMA(SE(B2:B6>20;1;0)) ou SOMARPRODUTO((B2:B6>20)*B2:B6). Com intervalos simples, valem as funções antigas.

import { Call } from '../call';
import { DIV0, isErrorValue, isMatrix, toMatrix, Value, VALOR, XlError } from '../values';
import { def } from './registry';

/** Algum argumento é uma expressão (função, operador, matriz literal) e não só referência ou constante. */
const hasComputedArg = (c: Call): boolean => c.nodes.some(n => n.t === 'call' || n.t === 'bin' || n.t === 'neg' || n.t === 'pct' || n.t === 'arr');

def(['SOMA', 'SUM'], c => c.numbers().reduce((a, b) => a + b, 0), hasComputedArg);

def(
  ['MÉDIA', 'MEDIA', 'AVERAGE'],
  c => {
    const xs = c.numbers();
    if (xs.length === 0) throw new XlError(DIV0);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  },
  hasComputedArg
);

def(['MÁXIMO', 'MAXIMO', 'MÁX', 'MAX'], c => {
  const xs = c.numbers();
  return xs.length === 0 ? 0 : Math.max(...xs);
}, hasComputedArg);

def(['MÍNIMO', 'MINIMO', 'MÍN', 'MIN'], c => {
  const xs = c.numbers();
  return xs.length === 0 ? 0 : Math.min(...xs);
}, hasComputedArg);

def(
  ['SOMARPRODUTO', 'SUMPRODUCT'],
  (c: Call): Value => {
    if (c.length === 0) throw new XlError(VALOR);
    const arrays = Array.from({ length: c.length }, (_, i) => toMatrix(c.value(i)));
    const rows = arrays[0].length;
    const cols = arrays[0][0]?.length ?? 0;
    if (arrays.some(a => a.length !== rows || (a[0]?.length ?? 0) !== cols)) throw new XlError(VALOR);
    let total = 0;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        let product = 1;
        for (const a of arrays) {
          const v = a[r][k];
          if (isErrorValue(v)) throw new XlError(String(v));
          product *= typeof v === 'number' ? v : typeof v === 'boolean' ? 0 : 0;
        }
        total += product;
      }
    }
    return total;
  },
  hasComputedArg
);

export { isMatrix };
