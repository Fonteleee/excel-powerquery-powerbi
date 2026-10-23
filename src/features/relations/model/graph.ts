// src/features/relations/model/graph.ts
// Modelo declarativo do fluxo (grafo) da aba de Relacionamentos.
// O grafo é a fonte da verdade: nós descrevem o que fazer, arestas são apenas fios.
// Colunas são referenciadas pelo NOME do cabeçalho (sobrevive a inserção/remoção de colunas).

export const FLOW_GRAPH_VERSION = 1;

export type AggType = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';

export type FilterOperator = '=' | '<>' | '>' | '<' | '>=' | '<=' | 'contains';

export interface FlowNodeBase {
  id: string;
  x: number;
  y: number;
  label?: string;
}

/** Referência a uma aba (planilha) do workbook. */
export interface TableNode extends FlowNodeBase {
  kind: 'table';
  sheetId: string;
}

/** Busca estilo PROCX/PROCV: acrescenta colunas de `lookup` na tabela de `in`. */
export interface LookupParams {
  op: 'lookup';
  sourceKey: string;
  lookupKey: string;
  returns: string[];
  ifNotFound: string;
  prefix?: string;
}

/** Agrupamento estilo SOMASE/MÉDIASE/CONT.SE. */
export interface AggregateParams {
  op: 'aggregate';
  groupBy: string[];
  aggregations: { column: string; agg: AggType; outputName?: string }[];
}

/** Filtro estilo FILTRO. */
export interface FilterParams {
  op: 'filter';
  conditions: { column: string; operator: FilterOperator; value: string }[];
}

export type TransformParams = LookupParams | AggregateParams | FilterParams;

export interface TransformNode extends FlowNodeBase {
  kind: 'transform';
  params: TransformParams;
}

/** Saída materializada em uma aba com id determinístico (`flow-out-<id>`). */
export interface OutputNode extends FlowNodeBase {
  kind: 'output';
  sheetName: string;
}

export type FlowNode = TableNode | TransformNode | OutputNode;

/** `in` é a entrada principal; `lookup` só existe em transformações `lookup`. */
export type FlowPort = 'in' | 'lookup';

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  toPort: FlowPort;
}

export interface FlowGraph {
  version: typeof FLOW_GRAPH_VERSION;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Prefixo das abas geradas pelo fluxo (`flow-out-<id do nó de saída>`). */
export const FLOW_SHEET_PREFIX = 'flow-out-';

export function createEmptyGraph(): FlowGraph {
  return { version: FLOW_GRAPH_VERSION, nodes: [], edges: [] };
}

/** Chaves que nunca podem ser usadas como nome de coluna (defesa contra prototype pollution). */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
