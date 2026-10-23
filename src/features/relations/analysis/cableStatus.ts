// src/features/relations/analysis/cableStatus.ts
// Estado visual de cada cabo (cor semântica + problema), derivado dos resultados avaliados.
// Cor nunca é a única pista: a interface também mostra ícone e texto (daltonismo).

import { FlowEdge, FlowGraph } from '../model/graph';
import type { LookupStats, NodeResult } from '../runtime/evaluate';

/** raw = dados brutos (ciano), lookup = busca/cruzamento (roxo), aggregate = agregação (laranja). */
export type CableKind = 'raw' | 'lookup' | 'aggregate';
export type CableProblem = 'none' | 'error' | 'orphans';

export interface CableStatus {
  kind: CableKind;
  problem: CableProblem;
  /** Linhas que passam pelo cabo (null se a origem falhou). */
  rows: number | null;
  /** Estatísticas do cruzamento, no cabo de ENTRADA de um lookup (onde moram os órfãos). */
  lookup?: LookupStats;
  /** Texto curto do problema, para tooltip/rótulo. */
  message?: string;
}

export function describeCable(
  graph: FlowGraph,
  edge: FlowEdge,
  results: ReadonlyMap<string, NodeResult>
): CableStatus {
  const source = graph.nodes.find(n => n.id === edge.from);
  const target = graph.nodes.find(n => n.id === edge.to);
  const sourceResult = results.get(edge.from);
  const targetResult = results.get(edge.to);

  let kind: CableKind = 'raw';
  if (edge.toPort === 'lookup') kind = 'lookup';
  else if (source?.kind === 'transform') {
    kind = source.params.op === 'lookup' ? 'lookup' : source.params.op === 'aggregate' ? 'aggregate' : 'raw';
  }

  const rows = sourceResult?.table ? sourceResult.table.rows.length : null;
  const isLookupEntry = target?.kind === 'transform' && target.params.op === 'lookup' && edge.toPort === 'in';
  const stats = isLookupEntry ? targetResult?.lookup : undefined;

  if (sourceResult?.error) {
    return { kind, problem: 'error', rows, message: sourceResult.rootCause ?? sourceResult.error };
  }
  if (targetResult?.error) {
    return { kind, problem: 'error', rows, message: targetResult.rootCause ?? targetResult.error };
  }
  if (stats && stats.orphans > 0) {
    return {
      kind,
      problem: 'orphans',
      rows,
      lookup: stats,
      message: `${stats.orphans} linha(s) sem correspondência`,
    };
  }
  return { kind, problem: 'none', rows, lookup: stats };
}

/** Rótulo curto de cardinalidade, com alerta quando há duplicidade que multiplica linhas. */
export function cardinalityNote(stats: LookupStats): { label: string; warning: string | null } {
  switch (stats.cardinality) {
    case '1:1':
      return { label: '1:1', warning: null };
    case 'N:1':
      return { label: 'N:1', warning: null };
    case '1:N':
      return { label: '1:N', warning: 'Chaves repetidas na tabela de busca: só a primeira ocorrência é usada' };
    case 'N:N':
      return { label: 'N:N', warning: 'Chaves repetidas nos dois lados: confira o resultado' };
  }
}
