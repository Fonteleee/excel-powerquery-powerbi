// src/engine/xl/lib/logic.ts
// Lógica e informação: SE, SES, SEERRO, SEND, E, OU, NÃO, ESCOLHER, É.NÚM, É.ERRO...

import { Call } from '../call';
import { flatten, isBlank, isErrorValue, isMatrix, mapMatrix, N_D, Scalar, toBool, toNumber, toScalar, Value, VALOR, XlError } from '../values';
import { def } from './registry';

/** SE com condição simples ou em matriz (cada posição escolhe seu ramo). */
def(
  ['SE', 'IF'],
  (c: Call): Value => {
    c.expect(2, 3);
    const cond = c.value(0);
    if (!isMatrix(cond)) {
      if (toBool(cond as Scalar)) return c.has(1) ? c.value(1) : true;
      return c.length > 2 ? (c.has(2) ? c.value(2) : 0) : false;
    }
    const yes = c.has(1) ? c.value(1) : true;
    const no = c.length > 2 ? (c.has(2) ? c.value(2) : 0) : false;
    return pick(cond, yes, no);
  },
  true
);

function pick(cond: Value, yes: Value, no: Value): Value {
  const cm = cond as Scalar[][];
  const at = (v: Value, r: number, col: number): Scalar => {
    if (!isMatrix(v)) return v;
    const rr = v.length === 1 ? 0 : r;
    const cc = (v[0]?.length ?? 1) === 1 ? 0 : col;
    return v[rr]?.[cc] ?? N_D;
  };
  return cm.map((row, r) =>
    row.map((cell, col) => {
      try {
        return toBool(cell) ? at(yes, r, col) : at(no, r, col);
      } catch (e) {
        if (e instanceof XlError) return e.code;
        throw e;
      }
    })
  );
}

def(['SES', 'IFS'], (c: Call): Value => {
  if (c.length < 2 || c.length % 2 !== 0) throw new XlError(VALOR);
  for (let i = 0; i < c.length; i += 2) if (toBool(c.scalar(i))) return c.value(i + 1);
  throw new XlError(N_D);
});

def(
  ['SEERRO', 'IFERROR'],
  (c: Call): Value => {
    c.expect(2);
    try {
      const v = c.value(0);
      const bad = (x: Scalar): boolean => isErrorValue(x) || (typeof x === 'number' && Number.isNaN(x));
      if (!isMatrix(v)) return bad(v) ? c.value(1) : v;
      return mapMatrix(v, x => (bad(x) ? toScalar(c.value(1)) : x)) as Value;
    } catch (e) {
      if (e instanceof XlError) return c.value(1);
      throw e;
    }
  },
  true
);

def(['SEND', 'IFNA'], (c: Call): Value => {
  c.expect(2);
  try {
    const v = c.value(0);
    return v === N_D ? c.value(1) : v;
  } catch (e) {
    if (e instanceof XlError && e.code === N_D) return c.value(1);
    throw e;
  }
});

/** Todos os valores lógicos dos argumentos (intervalos ignoram texto e vazio). */
function logicals(c: Call): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < c.length; i++) {
    const v = c.value(i);
    if (isMatrix(v)) {
      for (const cell of v.flat()) {
        if (isErrorValue(cell)) throw new XlError(String(cell));
        if (typeof cell === 'boolean') out.push(cell);
        else if (typeof cell === 'number') out.push(cell !== 0);
      }
    } else out.push(toBool(v));
  }
  if (out.length === 0) throw new XlError(VALOR);
  return out;
}

def(['E', 'AND'], c => logicals(c).every(Boolean));
def(['OU', 'OR'], c => logicals(c).some(Boolean));
def(['OUEXCLUSIVO', 'XOR'], c => logicals(c).filter(Boolean).length % 2 === 1);
def(['NÃO', 'NAO', 'NOT'], c => {
  c.expect(1);
  return mapMatrix(c.value(0), x => !toBool(x));
});
def(['VERDADEIRO', 'TRUE'], () => true);
def(['FALSO', 'FALSE'], () => false);
def(['NÃO.DISP', 'NAO.DISP', 'NA'], () => {
  throw new XlError(N_D);
});

def(['ESCOLHER', 'CHOOSE'], (c: Call): Value => {
  if (c.length < 2) throw new XlError(VALOR);
  const index = Math.trunc(c.num(0));
  if (index < 1 || index >= c.length) throw new XlError(VALOR);
  return c.value(index);
});

// ---- Informação ----------------------------------------------------------------------------------

const info = (names: string[], test: (v: Scalar) => boolean): void =>
  def(names, c => {
    c.expect(1);
    return mapMatrix(c.value(0), test);
  });

/** Funções É.* não propagam o erro do argumento: elas o inspecionam. */
const inspect = (names: string[], test: (v: Scalar) => boolean): void =>
  def(names, c => {
    c.expect(1);
    let v: Value;
    try {
      v = c.value(0);
    } catch (e) {
      if (e instanceof XlError) v = e.code;
      else throw e;
    }
    return isMatrix(v) ? v.map(row => row.map(test)) : test(v);
  });

inspect(['É.NÚM', 'ÉNÚM', 'ISNUMBER', 'E.NUM'], v => typeof v === 'number');
inspect(['ÉTEXTO', 'É.TEXTO', 'ISTEXT', 'E.TEXTO'], v => typeof v === 'string' && !isErrorValue(v));
inspect(['ÉNÃO.TEXTO', 'ISNONTEXT'], v => typeof v !== 'string' || isErrorValue(v));
inspect(['É.ERRO', 'ÉERRO', 'ISERROR', 'E.ERRO'], v => isErrorValue(v));
inspect(['É.ERROS', 'ÉERROS', 'ISERR'], v => isErrorValue(v) && v !== N_D);
inspect(['ÉNÃO.DISP', 'É.NÃO.DISP', 'ISNA'], v => v === N_D);
inspect(['É.CÉL.VAZIA', 'ÉCÉL.VAZIA', 'ISBLANK'], v => v === null || v === undefined);
inspect(['É.LÓGICO', 'ÉLÓGICO', 'ISLOGICAL'], v => typeof v === 'boolean');
info(['ÉPAR', 'ISEVEN'], v => Math.trunc(toNumber(v)) % 2 === 0);
info(['ÉÍMPAR', 'ISODD'], v => Math.abs(Math.trunc(toNumber(v))) % 2 === 1);

def(['N'], c => {
  c.expect(1);
  const v = c.scalar(0);
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
});
def(['T'], c => {
  c.expect(1);
  const v = c.scalar(0);
  return typeof v === 'string' ? v : '';
});
def(['TIPO', 'TYPE'], c => {
  c.expect(1);
  const v = c.value(0);
  if (isMatrix(v)) return 64;
  return typeof v === 'number' ? 1 : typeof v === 'string' ? (isErrorValue(v) ? 16 : 2) : typeof v === 'boolean' ? 4 : 1;
});

export { flatten, isBlank };
