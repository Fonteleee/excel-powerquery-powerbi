// src/features/relations/analysis/suggestions.ts
// Sugestão de operação ao ligar dois campos. A lista é ORDENADA pelo tipo inferido dos dois lados,
// mas nunca esconde nenhuma operação: quem sabe o que quer escolhe a que preferir.

import type { ColumnTypeInfo, InferredType } from './typeInference';

export type ConnectOperation = 'lookup' | 'sum' | 'avg' | 'count' | 'min' | 'max' | 'filter';

export interface OperationSuggestion {
  op: ConnectOperation;
  label: string;
  /** Equivalente na planilha, para quem vem do Excel. */
  excelName: string;
  score: number;
  /** A melhor opção para esse par de tipos. */
  recommended: boolean;
  /** Por que essa posição na lista. */
  reason: string;
}

export const OPERATION_LABELS: Record<ConnectOperation, { label: string; excelName: string }> = {
  lookup: { label: 'Buscar valores', excelName: 'PROCX' },
  sum: { label: 'Somar', excelName: 'SOMASE' },
  avg: { label: 'Média', excelName: 'MÉDIASE' },
  count: { label: 'Contar', excelName: 'CONT.SE' },
  min: { label: 'Mínimo', excelName: 'MÍNIMOSE' },
  max: { label: 'Máximo', excelName: 'MÁXIMOSE' },
  filter: { label: 'Filtrar', excelName: 'FILTRO' },
};

const BASE_SCORE: Record<ConnectOperation, number> = {
  lookup: 50,
  sum: 40,
  avg: 38,
  count: 36,
  filter: 30,
  min: 20,
  max: 19,
};

type Adjust = Partial<Record<ConnectOperation, number>>;

/** Ajustes pelo tipo do campo de DESTINO (o que será buscado/agregado). */
const BY_TARGET: Record<InferredType, { adjust: Adjust; reason: string }> = {
  number: {
    adjust: { sum: 45, avg: 42, count: 12, min: 25, max: 25, lookup: -10 },
    reason: 'O campo de destino é numérico: agregar costuma ser o objetivo',
  },
  id: {
    adjust: { lookup: 40, count: 12, sum: -25, avg: -25, min: -15, max: -15 },
    reason: 'O campo de destino é uma chave: buscar valores relacionados',
  },
  text: {
    adjust: { lookup: 35, count: 10, sum: -25, avg: -25, min: -15, max: -15 },
    reason: 'O campo de destino é texto: buscar valores relacionados',
  },
  date: {
    adjust: { lookup: 15, min: 30, max: 30, count: 6, sum: -30, avg: -25 },
    reason: 'O campo de destino é uma data: primeira/última ocorrência ou busca',
  },
  boolean: {
    adjust: { filter: 38, count: 30, lookup: -5, sum: -20, avg: -20, min: -15, max: -15 },
    reason: 'O campo de destino é verdadeiro/falso: filtrar ou contar',
  },
  empty: { adjust: {}, reason: 'Sem dados suficientes para sugerir pelo tipo' },
};

export interface SuggestionContext {
  /** Os dois campos são da mesma tabela. */
  sameTable?: boolean;
}

/**
 * Operações ordenadas para o par origem -> destino. `from`/`to` podem faltar (sem dados): vale a ordem padrão.
 */
export function suggestOperations(
  from: ColumnTypeInfo | undefined,
  to: ColumnTypeInfo | undefined,
  context: SuggestionContext = {}
): OperationSuggestion[] {
  const score: Record<ConnectOperation, number> = { ...BASE_SCORE };
  let headline = BY_TARGET.empty.reason;

  if (to) {
    const rule = BY_TARGET[to.type];
    headline = rule.reason;
    for (const [op, delta] of Object.entries(rule.adjust) as [ConnectOperation, number][]) {
      score[op] += delta;
    }
  }

  // Chave contra chave: é exatamente o caso do PROCX.
  if (from && to && (from.type === 'id' || from.type === 'text') && (to.type === 'id' || to.type === 'text')) {
    score.lookup += 10;
    headline = 'Os dois campos são chaves/texto: o caso clássico de busca';
  }
  // Origem numérica ligada a destino numérico: nada a buscar, só agregar.
  if (from?.type === 'number' && to?.type === 'number') {
    score.lookup -= 20;
    headline = 'Os dois campos são numéricos: agregar faz mais sentido que buscar';
  }
  if (context.sameTable) {
    score.lookup -= 15;
    score.sum += 5;
    score.avg += 5;
  }

  const order = (Object.keys(score) as ConnectOperation[]).sort(
    (a, b) => score[b] - score[a] || Object.keys(BASE_SCORE).indexOf(a) - Object.keys(BASE_SCORE).indexOf(b)
  );

  return order.map((op, index) => ({
    op,
    label: OPERATION_LABELS[op].label,
    excelName: OPERATION_LABELS[op].excelName,
    score: score[op],
    recommended: index === 0,
    reason: index === 0 ? headline : '',
  }));
}
