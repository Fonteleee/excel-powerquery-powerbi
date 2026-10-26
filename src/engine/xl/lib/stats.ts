// src/engine/xl/lib/stats.ts
// Estatística e contagem: CONT.NÚM, MED, MODO, DESVPAD, GRANDE, PERCENTIL, ORDEM, SOMASES, CONT.SES...

import { Call } from '../call';
import { DIV0, isBlank, isErrorValue, isMatrix, N_D, NUM, Scalar, toNumber, Value, VALOR, XlError } from '../values';
import { criteriaMatcher } from './criteria';
import { def } from './registry';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function nonEmpty(xs: number[]): number[] {
  if (xs.length === 0) throw new XlError(NUM);
  return xs;
}

function variance(xs: number[], sample: boolean): number {
  const n = xs.length;
  if (n < (sample ? 2 : 1)) throw new XlError(DIV0);
  const mean = sum(xs) / n;
  return sum(xs.map(x => (x - mean) ** 2)) / (sample ? n - 1 : n);
}

/** Percentil com interpolação linear (PERCENTIL.INC), k entre 0 e 1. */
function percentile(xs: number[], k: number): number {
  if (k < 0 || k > 1) throw new XlError(NUM);
  const s = [...nonEmpty(xs)].sort((a, b) => a - b);
  const pos = k * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

function mode(xs: number[]): number {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 1;
  for (const x of xs) {
    const n = counts.get(x)!;
    if (n > bestCount) {
      best = x;
      bestCount = n;
    }
  }
  if (best === null) throw new XlError(N_D);
  return best;
}

def(['CONT.NÚM', 'CONT.NUM', 'COUNT'], c => {
  let n = 0;
  for (let i = 0; i < c.length; i++) {
    const v = c.value(i);
    if (isMatrix(v)) n += v.flat().filter(x => typeof x === 'number').length;
    else if (typeof v === 'number') n++;
  }
  return n;
});

def(['CONTAR.VAZIO', 'COUNTBLANK'], c => {
  c.expect(1);
  return c.flat(0).filter(isBlank).length;
});

def(['MED', 'MEDIAN'], c => median(nonEmpty(c.numbers())));
def(['MODO', 'MODE', 'MODO.ÚNICO', 'MODE.SNGL'], c => mode(c.numbers()));
def(['DESVPAD', 'DESVPAD.S', 'STDEV', 'STDEV.S'], c => Math.sqrt(variance(c.numbers(), true)));
def(['DESVPAD.P', 'STDEVP', 'STDEV.P'], c => Math.sqrt(variance(c.numbers(), false)));
def(['VAR', 'VAR.S', 'VARA'], c => variance(c.numbers(), true));
def(['VAR.P', 'VARP'], c => variance(c.numbers(), false));

def(['GRANDE', 'LARGE'], c => {
  c.expect(2);
  const xs = [...c.numbers(0, 1)].sort((a, b) => b - a);
  const k = Math.trunc(c.num(1));
  if (k < 1 || k > xs.length) throw new XlError(NUM);
  return xs[k - 1];
});
def(['MENOR', 'SMALL'], c => {
  c.expect(2);
  const xs = [...c.numbers(0, 1)].sort((a, b) => a - b);
  const k = Math.trunc(c.num(1));
  if (k < 1 || k > xs.length) throw new XlError(NUM);
  return xs[k - 1];
});
def(['PERCENTIL', 'PERCENTIL.INC', 'PERCENTILE', 'PERCENTILE.INC'], c => {
  c.expect(2);
  return percentile(c.numbers(0, 1), c.num(1));
});
def(['QUARTIL', 'QUARTIL.INC', 'QUARTILE', 'QUARTILE.INC'], c => {
  c.expect(2);
  const q = Math.trunc(c.num(1));
  if (q < 0 || q > 4) throw new XlError(NUM);
  return percentile(c.numbers(0, 1), q / 4);
});

def(['ORDEM', 'ORDEM.EQ', 'RANK', 'RANK.EQ'], c => {
  c.expect(2, 3);
  const n = c.num(0);
  const xs = c.numbers(1, 2);
  if (!xs.includes(n)) throw new XlError(N_D);
  const ascending = c.num(2, 0) !== 0;
  return 1 + xs.filter(x => (ascending ? x < n : x > n)).length;
});

// ---- Critérios múltiplos ---------------------------------------------------------------------------

/** Posições que atendem a todos os pares (intervalo; critério) a partir do argumento `from`. */
function matchingIndexes(c: Call, from: number, size: number): number[] {
  if ((c.length - from) % 2 !== 0 || c.length - from < 2) throw new XlError(VALOR);
  let hits: number[] = Array.from({ length: size }, (_, i) => i);
  for (let i = from; i < c.length; i += 2) {
    const range = c.flat(i);
    if (range.length !== size) throw new XlError(VALOR);
    const test = criteriaMatcher(c.scalar(i + 1));
    hits = hits.filter(k => test(range[k]));
  }
  return hits;
}

const numericAt = (values: Scalar[], hits: number[]): number[] => {
  const out: number[] = [];
  for (const k of hits) {
    const v = values[k];
    if (isErrorValue(v)) throw new XlError(String(v));
    if (typeof v === 'number') out.push(v);
  }
  return out;
};

def(['SOMASES', 'SUMIFS'], c => {
  const values = c.flat(0);
  return sum(numericAt(values, matchingIndexes(c, 1, values.length)));
});
def(['CONT.SES', 'COUNTIFS'], c => {
  const size = c.flat(0).length;
  return matchingIndexes(c, 0, size).length;
});
def(['MÉDIASES', 'MEDIASES', 'AVERAGEIFS'], c => {
  const values = c.flat(0);
  const xs = numericAt(values, matchingIndexes(c, 1, values.length));
  if (xs.length === 0) throw new XlError(DIV0);
  return sum(xs) / xs.length;
});
def(['MÁXIMOSES', 'MAXIMOSES', 'MAXIFS'], c => {
  const values = c.flat(0);
  const xs = numericAt(values, matchingIndexes(c, 1, values.length));
  return xs.length === 0 ? 0 : Math.max(...xs);
});
def(['MÍNIMOSES', 'MINIMOSES', 'MINIFS'], c => {
  const values = c.flat(0);
  const xs = numericAt(values, matchingIndexes(c, 1, values.length));
  return xs.length === 0 ? 0 : Math.min(...xs);
});

// ---- SUBTOTAL / AGREGAR ---------------------------------------------------------------------------

function applyAggregate(code: number, xs: number[], extra?: number): Value {
  switch (code) {
    case 1:
      if (xs.length === 0) throw new XlError(DIV0);
      return sum(xs) / xs.length;
    case 2:
      return xs.length;
    case 3:
      return xs.length;
    case 4:
      return xs.length ? Math.max(...xs) : 0;
    case 5:
      return xs.length ? Math.min(...xs) : 0;
    case 6:
      return xs.reduce((a, b) => a * b, 1);
    case 7:
      return Math.sqrt(variance(xs, true));
    case 8:
      return Math.sqrt(variance(xs, false));
    case 9:
      return sum(xs);
    case 10:
      return variance(xs, true);
    case 11:
      return variance(xs, false);
    case 12:
      return median(xs);
    case 14: {
      const s = [...xs].sort((a, b) => b - a);
      const k = Math.trunc(extra ?? 1);
      if (k < 1 || k > s.length) throw new XlError(NUM);
      return s[k - 1];
    }
    case 15: {
      const s = [...xs].sort((a, b) => a - b);
      const k = Math.trunc(extra ?? 1);
      if (k < 1 || k > s.length) throw new XlError(NUM);
      return s[k - 1];
    }
    default:
      throw new XlError(VALOR);
  }
}

def(['SUBTOTAL'], c => {
  if (c.length < 2) throw new XlError(VALOR);
  const code = Math.trunc(c.num(0));
  const base = code > 100 ? code - 100 : code;
  if (base < 1 || base > 11) throw new XlError(VALOR);
  return applyAggregate(base, c.numbers(1));
});

def(['AGREGAR', 'AGGREGATE'], c => {
  if (c.length < 3) throw new XlError(VALOR);
  const code = Math.trunc(c.num(0));
  const ignoreErrors = [2, 3, 6, 7].includes(Math.trunc(c.num(1)));
  const values: number[] = [];
  const last = code >= 14 ? c.length - 1 : c.length;
  for (let i = 2; i < last; i++) {
    for (const cell of c.flat(i)) {
      if (isErrorValue(cell)) {
        if (!ignoreErrors) throw new XlError(String(cell));
      } else if (typeof cell === 'number') values.push(cell);
    }
  }
  return applyAggregate(code, values, code >= 14 ? toNumber(c.scalar(c.length - 1)) : undefined);
});
