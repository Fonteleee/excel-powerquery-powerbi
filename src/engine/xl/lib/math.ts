// src/engine/xl/lib/math.ts
// Matemática: ARRED e família, MOD, POTÊNCIA, RAIZ, LOG, ALEATÓRIO, FATORIAL...

import { Call } from '../call';
import { DIV0, mapMatrix, NUM, toNumber, Value, XlError } from '../values';
import { def } from './registry';

/** Arredonda como o Excel: metade se afasta do zero (2,5 -> 3; -2,5 -> -3). */
export function roundHalfAway(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  const y = Math.abs(x) * f;
  const r = Math.floor(y + 0.5 + 1e-9);
  return (Math.sign(x) * r) / f;
}

function directed(x: number, digits: number, up: boolean): number {
  const f = Math.pow(10, digits);
  const y = Math.abs(x) * f;
  const snapped = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : y;
  const r = up ? Math.ceil(snapped) : Math.floor(snapped);
  return (Math.sign(x) * r) / f;
}

const unary = (names: string[], fn: (n: number) => number): void =>
  def(
    names,
    (c: Call): Value => {
      c.expect(1);
      return mapMatrix(c.value(0), v => check(fn(toNumber(v))));
    },
    true
  );

const check = (n: number): number => {
  if (!Number.isFinite(n)) throw new XlError(NUM);
  return n;
};

unary(['ABS'], Math.abs);
unary(['INT'], Math.floor);
unary(['RAIZ', 'SQRT'], n => {
  if (n < 0) throw new XlError(NUM);
  return Math.sqrt(n);
});
unary(['EXP'], Math.exp);
unary(['LN'], n => {
  if (n <= 0) throw new XlError(NUM);
  return Math.log(n);
});
unary(['LOG10'], n => {
  if (n <= 0) throw new XlError(NUM);
  return Math.log10(n);
});
unary(['SINAL', 'SIGN'], Math.sign);
unary(['SEN', 'SIN'], Math.sin);
unary(['COS'], Math.cos);
unary(['TAN'], Math.tan);
unary(['GRAUS', 'DEGREES'], n => (n * 180) / Math.PI);
unary(['RADIANOS', 'RADIANS'], n => (n * Math.PI) / 180);
unary(['FATORIAL', 'FACT'], n => {
  if (n < 0 || n > 170) throw new XlError(NUM);
  let r = 1;
  for (let i = 2; i <= Math.trunc(n); i++) r *= i;
  return r;
});

def(['PI'], () => Math.PI);

const rounding = (names: string[], fn: (n: number, d: number) => number): void =>
  def(
    names,
    (c: Call): Value => {
      c.expect(1, 2);
      const digits = Math.trunc(c.num(1, 0));
      return mapMatrix(c.value(0), v => fn(toNumber(v), digits));
    },
    true
  );

rounding(['ARRED', 'ROUND'], roundHalfAway);
rounding(['ARREDONDAR.PARA.CIMA', 'ROUNDUP'], (n, d) => directed(n, d, true));
rounding(['ARREDONDAR.PARA.BAIXO', 'ROUNDDOWN'], (n, d) => directed(n, d, false));
rounding(['TRUNCAR', 'TRUNC'], (n, d) => directed(n, d, false));

def(['MOD', 'RESTO'], (c: Call): Value => {
  c.expect(2);
  const n = c.num(0);
  const d = c.num(1);
  if (d === 0) throw new XlError(DIV0);
  return n - d * Math.floor(n / d);
});

def(['QUOCIENTE', 'QUOTIENT'], (c: Call): Value => {
  c.expect(2);
  const d = c.num(1);
  if (d === 0) throw new XlError(DIV0);
  return Math.trunc(c.num(0) / d);
});

def(['POTÊNCIA', 'POTENCIA', 'POWER'], (c: Call): Value => {
  c.expect(2);
  const r = Math.pow(c.num(0), c.num(1));
  if (!Number.isFinite(r)) throw new XlError(NUM);
  return r;
});

def(['LOG'], (c: Call): Value => {
  c.expect(1, 2);
  const n = c.num(0);
  const base = c.num(1, 10);
  if (n <= 0 || base <= 0 || base === 1) throw new XlError(NUM);
  return Math.log(n) / Math.log(base);
});

def(['MULT', 'MROUND', 'ARRED.MÚLTIPLO', 'ARRED.MULTIPLO'], (c: Call): Value => {
  c.expect(2);
  const n = c.num(0);
  const m = c.num(1);
  if (m === 0) return 0;
  if (n * m < 0) throw new XlError(NUM);
  return roundHalfAway(n / m, 0) * m;
});

def(['TETO', 'CEILING'], (c: Call): Value => {
  c.expect(1, 2);
  const m = c.num(1, 1);
  return m === 0 ? 0 : Math.ceil(c.num(0) / m - 1e-12) * m;
});

def(['PISO', 'FLOOR'], (c: Call): Value => {
  c.expect(1, 2);
  const m = c.num(1, 1);
  return m === 0 ? 0 : Math.floor(c.num(0) / m + 1e-12) * m;
});

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
def(['MDC', 'GCD'], c => c.numbers().map(Math.trunc).reduce((a, b) => gcd(a, b), 0));
def(['MMC', 'LCM'], c => c.numbers().map(Math.trunc).reduce((a, b) => (a === 0 || b === 0 ? 0 : (a / gcd(a, b)) * b), 1));

def(['PRODUTO', 'PRODUCT'], c => c.numbers().reduce((a, b) => a * b, 1));
def(['SOMAQUAD', 'SUMSQ'], c => c.numbers().reduce((a, b) => a + b * b, 0));

def(['ALEATÓRIO', 'ALEATORIO', 'RAND'], () => Math.random());
def(['ALEATÓRIOENTRE', 'ALEATORIOENTRE', 'RANDBETWEEN'], (c: Call): Value => {
  c.expect(2);
  const lo = Math.ceil(c.num(0));
  const hi = Math.floor(c.num(1));
  if (hi < lo) throw new XlError(NUM);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
});
