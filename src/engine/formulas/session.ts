// src/engine/formulas/session.ts
// Sessão de avaliação: estado válido apenas durante UM recálculo (cache de intervalos, índices de busca
// e a política de "este valor calculado ainda é confiável?"). Fora de uma sessão o avaliador se comporta
// exatamente como o motor antigo (sem cache, recalculando por recursão).

export interface RangeValuesCache {
  flat?: any[];
  matrix?: any[][];
}

export interface EvalSession {
  /**
   * O valor já calculado (`cell.value`) desta célula de fórmula pode ser usado sem reavaliar?
   * Falso para células "sujas" que ainda não foram recalculadas nesta rodada (rede de segurança:
   * se o grafo não previu a dependência, o avaliador volta ao caminho recursivo e continua correto).
   */
  isFresh(sheetId: string, cellKey: string): boolean;
  /** Intervalos já extraídos nesta rodada: `${abaId}|${l1}|${c1}|${l2}|${c2}`. */
  readonly rangeCache: Map<string, RangeValuesCache>;
  /** Índices auxiliares por vetor de valores (busca exata e critérios de igualdade). */
  readonly indexCache: WeakMap<object, unknown>;
  readonly stats: { rangeHits: number; rangeMisses: number; indexedLookups: number; linearLookups: number };
}

export function createSession(isFresh: EvalSession['isFresh']): EvalSession {
  return {
    isFresh,
    rangeCache: new Map(),
    indexCache: new WeakMap(),
    stats: { rangeHits: 0, rangeMisses: 0, indexedLookups: 0, linearLookups: 0 },
  };
}

let active: EvalSession | null = null;

/** Sessão em andamento (ou `null` fora de um recálculo). */
export function activeSession(): EvalSession | null {
  return active;
}

/** Executa `fn` com a sessão ativa. A avaliação é síncrona, então não há intercalação entre sessões. */
export function withSession<T>(session: EvalSession, fn: () => T): T {
  const previous = active;
  active = session;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
