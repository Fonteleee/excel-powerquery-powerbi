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
   * Referência simples a uma célula de fórmula: o valor já calculado pode ser usado sem reavaliar?
   * Só é verdadeiro para células de abas "confiáveis" que já foram recalculadas nesta rodada. Quando falso,
   * o avaliador volta ao caminho recursivo do motor antigo (rede de segurança: continua correto).
   */
  isFresh(sheetId: string, cellKey: string): boolean;
  /** A fórmula está na fila desta rodada e ainda não foi recalculada? (leitura de intervalos) */
  isPending(sheetId: string, cellKey: string): boolean;
  /** Intervalos já extraídos nesta rodada: `${abaId}|${l1}|${c1}|${l2}|${c2}`. */
  readonly rangeCache: Map<string, RangeValuesCache>;
  /** Índices auxiliares por vetor de valores (busca exata e critérios de igualdade). */
  readonly indexCache: WeakMap<object, unknown>;
  readonly stats: { rangeHits: number; rangeMisses: number; indexedLookups: number; linearLookups: number };
}

export function createSession(policy: Pick<EvalSession, 'isFresh' | 'isPending'>): EvalSession {
  return {
    isFresh: policy.isFresh,
    isPending: policy.isPending,
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
