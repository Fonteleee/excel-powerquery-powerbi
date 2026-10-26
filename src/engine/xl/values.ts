// src/engine/xl/values.ts
// Modelo de valores e conversões com as regras do Excel (número, texto, lógico, vazio, erro, matriz).

import { parseNumberSafely } from '../formulas/numbers';

/** Erro de fórmula: o `message` é o código exibido na célula (ex.: "#N/D"). */
export class XlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type Scalar = number | string | boolean | null;
export type Matrix = Scalar[][];
export type Value = Scalar | Matrix;

export const N_D = '#N/D';
export const VALOR = '#VALOR!';
export const REF = '#REF!';
export const DIV0 = '#DIV/0!';
export const NUM = '#NÚM!';
export const NOME = '#NOME?';

const ERROR_CODES = new Set(['#N/D', '#VALOR!', '#REF!', '#DIV/0!', '#NOME?', '#NÚM!', '#NULO!', '#CIRCULAR!', '#DESPEJAR!', '#N/A', '#VALUE!', '#NUM!', '#NAME?']);

export const isMatrix = (v: unknown): v is Matrix => Array.isArray(v);

/** Um texto que é código de erro (é assim que os erros ficam guardados nas células). */
export const isErrorValue = (v: unknown): boolean => typeof v === 'string' && v.length > 1 && v.charCodeAt(0) === 35 && ERROR_CODES.has(v);

export const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

// ---- Datas (sistema 1900 do Excel; número de série 1 = 01/01/1900) -------------------------------

const EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function serialFromParts(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH) / DAY_MS);
}

export function partsFromSerial(serial: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(EPOCH + Math.floor(serial) * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

const DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** "05/01/2024", "05/01/24", "2024-01-05" (com hora opcional) -> número de série, ou null. */
export function parseDateText(text: string): number | null {
  const t = text.trim();
  let y: number;
  let mo: number;
  let d: number;
  let rest: RegExpExecArray | null = DATE_RE.exec(t);
  if (rest) {
    d = Number(rest[1]);
    mo = Number(rest[2]);
    y = Number(rest[3]);
    if (rest[3].length <= 2) y += y < 30 ? 2000 : 1900;
  } else {
    rest = ISO_RE.exec(t);
    if (!rest) return null;
    y = Number(rest[1]);
    mo = Number(rest[2]);
    d = Number(rest[3]);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null;
  const time = rest[4] !== undefined ? (Number(rest[4]) * 3600 + Number(rest[5]) * 60 + Number(rest[6] ?? 0)) / 86400 : 0;
  return serialFromParts(y, mo, d) + time;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** Número de série -> "05/01/2024" (com " hh:mm:ss" quando há hora). */
export function formatDateSerial(serial: number): string {
  const { year, month, day } = partsFromSerial(serial);
  const frac = serial - Math.floor(serial);
  const date = `${two(day)}/${two(month)}/${year}`;
  if (frac < 1e-9) return date;
  const secs = Math.round(frac * 86400);
  return `${date} ${two(Math.floor(secs / 3600) % 24)}:${two(Math.floor(secs / 60) % 60)}:${two(secs % 60)}`;
}

// ---- Conversões ---------------------------------------------------------------------------------

/** Para operações aritméticas: texto numérico e datas viram número; texto qualquer é #VALOR!. */
export function toNumber(v: Scalar): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErrorValue(v)) throw new XlError(String(v));
  const parsed = parseNumberSafely(v);
  if (parsed !== null) return parsed;
  const date = parseDateText(v);
  if (date !== null) return date;
  throw new XlError(VALOR);
}

export function toText(v: Scalar): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e12) / 1e12);
  if (isErrorValue(v)) throw new XlError(String(v));
  return v;
}

export function toBool(v: Scalar): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErrorValue(v)) throw new XlError(String(v));
  const u = v.trim().toUpperCase();
  if (u === 'VERDADEIRO' || u === 'TRUE') return true;
  if (u === 'FALSO' || u === 'FALSE') return false;
  const n = parseNumberSafely(v);
  if (n !== null) return n !== 0;
  throw new XlError(VALOR);
}

/** Primeiro valor da matriz (interseção implícita) ou o próprio escalar. */
export const toScalar = (v: Value): Scalar => (isMatrix(v) ? (v[0]?.[0] ?? null) : v);

export const toMatrix = (v: Value): Matrix => (isMatrix(v) ? v : [[v]]);

export const flatten = (v: Value): Scalar[] => (isMatrix(v) ? v.flat() : [v]);

// ---- Comparação (regras do Excel: número < texto < lógico; texto sem diferenciar maiúsculas) ----------

function rank(v: Scalar): number {
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  return 3;
}

export function compareScalars(a: Scalar, b: Scalar): number {
  if (isErrorValue(a)) throw new XlError(String(a));
  if (isErrorValue(b)) throw new XlError(String(b));
  // Vazio vale 0, "" ou FALSO conforme o outro lado.
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLocaleLowerCase('pt-BR');
    const y = b.toLocaleLowerCase('pt-BR');
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a === b ? 0 : a ? 1 : -1;
}

/** Aplica `fn` célula a célula, repetindo linhas/colunas de tamanho 1 (como o Excel). */
export function broadcast(a: Value, b: Value, fn: (x: Scalar, y: Scalar) => Scalar): Value {
  if (!isMatrix(a) && !isMatrix(b)) return fn(a, b);
  const ma = toMatrix(a);
  const mb = toMatrix(b);
  const rows = Math.max(ma.length, mb.length);
  const cols = Math.max(ma[0]?.length ?? 1, mb[0]?.length ?? 1);
  const out: Matrix = [];
  for (let r = 0; r < rows; r++) {
    const row: Scalar[] = [];
    for (let c = 0; c < cols; c++) {
      const ra = ma.length === 1 ? 0 : r;
      const ca = (ma[0]?.length ?? 1) === 1 ? 0 : c;
      const rb = mb.length === 1 ? 0 : r;
      const cb = (mb[0]?.length ?? 1) === 1 ? 0 : c;
      const x = ma[ra]?.[ca];
      const y = mb[rb]?.[cb];
      if (x === undefined || y === undefined) {
        row.push(N_D);
        continue;
      }
      try {
        row.push(fn(x, y));
      } catch (e) {
        if (e instanceof XlError) row.push(e.code);
        else throw e;
      }
    }
    out.push(row);
  }
  return out;
}

export function mapMatrix(v: Value, fn: (x: Scalar) => Scalar): Value {
  if (!isMatrix(v)) return fn(v);
  return v.map(row =>
    row.map(cell => {
      try {
        return fn(cell);
      } catch (e) {
        if (e instanceof XlError) return e.code;
        throw e;
      }
    })
  );
}
