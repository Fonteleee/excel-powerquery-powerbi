// src/engine/formulas/functions/valueIndex.ts
// Índice de igualdade sobre um vetor de valores, para PROCX/PROCV/CORRESP/CONT.SE/SOMASE/MÉDIASE.
// Dá exatamente o mesmo resultado de varrer o vetor com `valuesMatch`, mas em tempo ~O(1) por consulta.
// Só existe dentro de uma sessão de recálculo (o vetor é o mesmo objeto em cache durante a rodada).

import { activeSession } from '../session';
import { parseNumberSafely, valuesMatch } from '../numbers';

/** Tolerância numérica de `valuesMatch` (1e-9): números caem em "baldes" de 1e-9 e vizinhos são testados. */
const bucket = (n: number): number => Math.round(n * 1e9);

export class ValueIndex {
  private readonly byText = new Map<string, number[]>();
  private readonly byNumber = new Map<number, number[]>();

  constructor(private readonly values: readonly unknown[]) {
    for (let i = 0; i < values.length; i++) {
      const item = values[i];
      if (item === null || item === undefined) continue;
      const text = String(item).trim().toLowerCase();
      const textList = this.byText.get(text);
      if (textList) textList.push(i);
      else this.byText.set(text, [i]);

      const num = parseNumberSafely(item);
      if (num !== null) {
        const b = bucket(num);
        const numList = this.byNumber.get(b);
        if (numList) numList.push(i);
        else this.byNumber.set(b, [i]);
      }
    }
  }

  /**
   * Índices (crescentes) dos itens que `valuesMatch(item, criteria)` aceita, ou `null` quando o critério
   * tem curingas (* ou ?) e a consulta precisa varrer o vetor.
   */
  matches(criteria: unknown): number[] | null {
    if (criteria === null || criteria === undefined) return [];
    if (typeof criteria === 'string' && (criteria.includes('*') || criteria.includes('?'))) return null;

    const candidates = new Set<number>();
    for (const i of this.byText.get(String(criteria).trim().toLowerCase()) ?? []) candidates.add(i);
    const num = parseNumberSafely(criteria);
    if (num !== null) {
      const b = bucket(num);
      for (let d = -1; d <= 1; d++) for (const i of this.byNumber.get(b + d) ?? []) candidates.add(i);
    }
    return [...candidates].sort((x, y) => x - y).filter(i => valuesMatch(this.values[i], criteria));
  }

  /** Primeiro índice que casa, `-1` se nenhum, `null` se o critério não é indexável. */
  first(criteria: unknown): number | null {
    const hits = this.matches(criteria);
    if (hits === null) return null;
    return hits.length > 0 ? hits[0] : -1;
  }
}

/** Índice do vetor na sessão ativa (`null` fora de um recálculo ou para vetores minúsculos). */
export function indexFor(values: readonly unknown[]): ValueIndex | null {
  const session = activeSession();
  if (!session || values.length < 16) return null;
  let index = session.indexCache.get(values) as ValueIndex | undefined;
  if (!index) {
    index = new ValueIndex(values);
    session.indexCache.set(values, index);
  }
  return index;
}

/** Primeira coluna de uma matriz como vetor (em cache por matriz, para o índice ser reaproveitado). */
export function firstColumnOf(matrix: readonly (readonly unknown[])[]): readonly unknown[] {
  const session = activeSession();
  if (!session) return matrix.map(row => row[0]);
  let column = session.indexCache.get(matrix) as unknown[] | undefined;
  if (!column) {
    column = matrix.map(row => row[0]);
    session.indexCache.set(matrix, column);
  }
  return column;
}
