// src/features/relations/analysis/keys.ts
// Normalização de chaves e classificação de tipo, iguais às do motor (evaluate.ts), para a análise.

import { parseNumberSafely } from '../../../engine/formulaParser';
import { Cell } from '../runtime/evaluate';

export type KeyKind = 'number' | 'text' | 'boolean' | 'empty';

export interface KindCounts {
  number: number;
  text: number;
  boolean: number;
  empty: number;
}

/** Mesma regra do `lookup`: vazio/nulo não tem chave; o resto é `String(v).trim().toLowerCase()`. */
export function normalizeKey(value: Cell): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim().toLowerCase();
}

export function kindOf(value: Cell): KeyKind {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

export function countKinds(values: readonly Cell[]): KindCounts {
  const counts: KindCounts = { number: 0, text: 0, boolean: 0, empty: 0 };
  for (const value of values) counts[kindOf(value)]++;
  return counts;
}

/** Valor numérico de uma chave, se ela for (ou parecer) um número: "001", "1.0" e 1 dão 1. */
export function numericValue(value: Cell): number | null {
  if (value === null || value === undefined || value === '') return null;
  return parseNumberSafely(value);
}

/** Tipo predominante entre os preenchidos (empate favorece texto). */
export function dominantKind(counts: KindCounts): KeyKind {
  const filled: [KeyKind, number][] = [
    ['text', counts.text],
    ['number', counts.number],
    ['boolean', counts.boolean],
  ];
  const best = filled.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] === 0 ? 'empty' : best[0];
}

/** Limita a amostra a um inteiro seguro. */
export function clampLimit(limit: number | undefined, fallback: number, max = 1000): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(limit)));
}
