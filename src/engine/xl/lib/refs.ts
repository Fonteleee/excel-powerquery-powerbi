// src/engine/xl/lib/refs.ts
// Referências e matrizes: INDIRETO, DESLOC, LIN, COL, LINS, COLS, TRANSPOR, PROCH.

import { Call } from '../call';
import { compareScalars, isMatrix, Matrix, N_D, REF, Scalar, toMatrix, Value, VALOR, XlError } from '../values';
import { def } from './registry';

def(['INDIRETO', 'INDIRECT'], (c: Call): Value => c.ev.evalText(c.text(0)));

def(['DESLOC', 'OFFSET'], (c: Call): Value => {
  c.expect(3, 5);
  const target = c.ref(0);
  if (!target) throw new XlError(VALOR);
  const { sheet, range } = target;
  const height = c.has(3) ? c.int(3) : range.endRow - range.startRow + 1;
  const width = c.has(4) ? c.int(4) : range.endCol - range.startCol + 1;
  const startRow = range.startRow + c.int(1);
  const startCol = range.startCol + c.int(2);
  if (startRow < 0 || startCol < 0 || height < 1 || width < 1) throw new XlError(REF);
  const out = { startRow, startCol, endRow: startRow + height - 1, endCol: startCol + width - 1 };
  const host = c.ev.host;
  return height === 1 && width === 1 ? host.readCell(sheet, startRow, startCol) : host.readRange(sheet, out);
});

def(['LIN', 'ROW'], (c: Call): Value => {
  c.expect(1);
  const target = c.ref(0);
  if (!target) throw new XlError(VALOR);
  return target.range.startRow + 1;
});

def(['COL', 'COLUMN'], (c: Call): Value => {
  c.expect(1);
  const target = c.ref(0);
  if (!target) throw new XlError(VALOR);
  return target.range.startCol + 1;
});

def(['LINS', 'ROWS'], (c: Call): Value => {
  c.expect(1);
  return c.matrix(0).length;
});

def(['COLS', 'COLUMNS'], (c: Call): Value => {
  c.expect(1);
  return c.matrix(0)[0]?.length ?? 0;
});

def(['TRANSPOR', 'TRANSPOSE'], (c: Call): Value => {
  c.expect(1);
  const m = c.matrix(0);
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const out: Matrix = Array.from({ length: cols }, (_, ci) => Array.from({ length: rows }, (_, ri) => m[ri][ci]));
  return out;
});

def(['PROCH', 'HLOOKUP'], (c: Call): Value => {
  c.expect(3, 4);
  const key = c.scalar(0);
  const table = toMatrix(c.value(1));
  const row = c.int(2);
  if (row < 1 || row > table.length) throw new XlError(REF);
  const header = table[0] ?? [];
  // Como no Excel: sem o 4º argumento a busca é aproximada (cabeçalhos em ordem crescente).
  const approximate = c.has(3) ? c.bool(3) : true;
  let found = -1;
  if (!approximate) {
    found = header.findIndex(h => h !== null && sameKey(h, key));
  } else {
    for (let i = 0; i < header.length; i++) {
      if (header[i] === null) continue;
      if (compareScalars(header[i], key) <= 0) found = i;
      else break;
    }
  }
  if (found < 0) throw new XlError(N_D);
  return table[row - 1][found];
});

function sameKey(a: Scalar, b: Scalar): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
  return compareScalars(a, b) === 0;
}

export { isMatrix };
