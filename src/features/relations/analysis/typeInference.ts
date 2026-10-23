// src/features/relations/analysis/typeInference.ts
// Inferência de tipo pelos VALORES da coluna (o cabeçalho só desempata chave/ID).
// Funções puras: sem DOM, sem planilha. Entrada é a tabela avaliada do grafo.
//
// Tipos: texto, número, data (inclui data/hora e hora), booleano, chave/ID (alta unicidade ou código) e vazio.
// Tolerância: 90% dos valores preenchidos precisam concordar, então uma célula suja não muda o tipo da coluna.

import type { Cell, FlowTable } from '../runtime/evaluate';

export type InferredType = 'text' | 'number' | 'date' | 'boolean' | 'id' | 'empty';

export interface ColumnTypeInfo {
  type: InferredType;
  /** Valores preenchidos analisados (limitado a `SAMPLE_LIMIT`). */
  filled: number;
  distinct: number;
  uniqueRatio: number;
  emptyRate: number;
  /** Só para colunas numéricas (e IDs numéricos). */
  numberRange?: { min: number; max: number };
  /** Todos os números são inteiros. */
  integerOnly?: boolean;
}

export const SAMPLE_LIMIT = 2000;
const AGREEMENT = 0.9;
const UNIQUE_THRESHOLD = 0.95;

export const TYPE_LABELS: Record<InferredType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  boolean: 'Booleano',
  id: 'Chave / ID',
  empty: 'Vazio',
};

const BOOLEAN_WORDS = new Set(['true', 'false', 'verdadeiro', 'falso', 'sim', 'nao', 'não', 'yes', 'no']);
const ID_HEADER = /(^|[^a-z0-9])(id|ids|cod|c[oó]d|c[oó]digo|chave|key|cpf|cnpj|matr[ií]cula|sku|ref|uuid|guid)([^a-z0-9]|$)/i;
const CAMEL_ID_HEADER = /[a-z]ID$/;

const isEmptyCell = (value: Cell): boolean => value === null || value === undefined || value === '';

/** Número em formato brasileiro ou internacional ("1.234,56", "1,234.56", "R$ 10", "15%"). Null se não for número. */
export function parseLooseNumber(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (s === '') return null;
  s = s.replace(/^(R\$|US\$|\$|€|£)\s*/i, '').replace(/\s*%$/, '').replace(/\s/g, '');
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  // Zeros à esquerda ("007") são códigos, não números.
  if (/^[-+]?0\d+$/.test(s)) return null;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas > 0 && dots > 0) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (commas > 1) {
    s = s.split(',').join('');
  } else if (commas === 1) {
    s = s.replace(',', '.');
  } else if (dots > 1) {
    s = s.split('.').join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validDay(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Datas ISO, dd/mm/aaaa (ou mm/dd/aaaa), com hora opcional, e horas ("08:30"). */
export function looksLikeDate(value: Cell): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s === '') return false;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (iso) return Number(iso[1]) >= 1900 && Number(iso[1]) <= 2200 && validDay(Number(iso[3]), Number(iso[2]));

  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (br) {
    const a = Number(br[1]);
    const b = Number(br[2]);
    return validDay(a, b) || validDay(b, a);
  }

  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  return !!time && Number(time[1]) < 48 && Number(time[2]) < 60;
}

function isBooleanLike(value: Cell): boolean {
  if (typeof value === 'boolean') return true;
  return typeof value === 'string' && BOOLEAN_WORDS.has(value.trim().toLowerCase());
}

/** Código tipo "A01", "CLI-0042", "2024/17": sem espaços e com ao menos um dígito. */
function isCodeLike(value: Cell): boolean {
  if (typeof value === 'number') return Number.isInteger(value);
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(value.trim()) && /\d/.test(value);
}

export function headerSuggestsId(header: string | undefined): boolean {
  return header !== undefined && (ID_HEADER.test(header) || CAMEL_ID_HEADER.test(header));
}

/** Infere o tipo de uma coluna a partir dos valores (e, só para desempatar ID, do cabeçalho). */
export function inferColumnType(values: readonly Cell[], header?: string): ColumnTypeInfo {
  const total = Math.min(values.length, SAMPLE_LIMIT);
  let filled = 0;
  let nBool = 0;
  let nNum = 0;
  let nInt = 0;
  let nDate = 0;
  let nCode = 0;
  let min = Infinity;
  let max = -Infinity;
  const seen = new Set<string>();
  const lengths = new Set<number>();

  for (let i = 0; i < total; i++) {
    const value = values[i];
    if (isEmptyCell(value)) continue;
    filled++;
    seen.add(String(value).trim().toLowerCase());

    if (isBooleanLike(value)) nBool++;
    if (looksLikeDate(value)) nDate++;
    if (isCodeLike(value)) nCode++;
    const n = parseLooseNumber(value);
    if (n !== null && !isBooleanLike(value)) {
      nNum++;
      if (Number.isInteger(n)) {
        nInt++;
        lengths.add(String(Math.abs(n)).length);
      }
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }

  const distinct = seen.size;
  const uniqueRatio = filled > 0 ? distinct / filled : 0;
  const emptyRate = total > 0 ? (total - filled) / total : 1;
  const base = { filled, distinct, uniqueRatio, emptyRate };
  if (filled === 0) return { type: 'empty', ...base };

  const agree = (n: number): boolean => n / filled >= AGREEMENT;
  const hint = headerSuggestsId(header);
  const numberRange = Number.isFinite(min) ? { min, max } : undefined;
  const integerOnly = nNum > 0 && nInt === nNum;

  // Booleano: poucas categorias. Evita classificar uma coluna "Sim/Não/Talvez" de 3 mil linhas por engano.
  if (agree(nBool) && distinct <= 4) return { type: 'boolean', ...base };
  if (agree(nDate)) return { type: 'date', ...base };

  if (agree(nNum)) {
    const sameLength = lengths.size === 1 && [...lengths][0] >= 5;
    const isId = integerOnly && (hint || (uniqueRatio >= UNIQUE_THRESHOLD && filled >= 3 && sameLength));
    return { type: isId ? 'id' : 'number', ...base, numberRange, integerOnly };
  }

  const codeColumn = agree(nCode);
  const highlyUnique = uniqueRatio >= UNIQUE_THRESHOLD && filled >= 3;
  const isId = (codeColumn && (highlyUnique || hint)) || (hint && highlyUnique);
  return { type: isId ? 'id' : 'text', ...base };
}

const cache = new WeakMap<FlowTable, Record<string, ColumnTypeInfo>>();

/** Tipos de todas as colunas de uma tabela (memoizado por referência da tabela). */
export function inferTableTypes(table: FlowTable): Record<string, ColumnTypeInfo> {
  const cached = cache.get(table);
  if (cached) return cached;
  const types: Record<string, ColumnTypeInfo> = Object.create(null);
  for (const header of table.headers) {
    const limit = Math.min(table.rows.length, SAMPLE_LIMIT);
    const column: Cell[] = new Array<Cell>(limit);
    for (let i = 0; i < limit; i++) column[i] = table.rows[i][header];
    types[header] = inferColumnType(column, header);
  }
  cache.set(table, types);
  return types;
}

export const isNumericType = (type: InferredType | undefined): boolean => type === 'number';
export const isKeyLikeType = (type: InferredType | undefined): boolean => type === 'id' || type === 'text';
