// src/features/relations/analysis/connectPlan.ts
// Transforma o gesto "arrastar de um campo até outro" em nós e arestas do grafo, já com a chave INFERIDA:
//  - o campo de ORIGEM é a chave de busca (sourceKey) e o campo de DESTINO define a coluna de busca (lookupKey);
//  - agregações estilo SOMASE criam  agregação (tabela de destino) + busca (tabela de origem) automaticamente.
// Puro: recebe o grafo e um contexto com colunas/tipos; devolve o grafo novo.

import {
  addOutputNode,
  addTransformNode,
  connect,
  EditResult,
  Point,
  updateTransformParams,
} from '../model/editor';
import { AggType, FlowGraph, FlowPort, LookupParams, TransformParams } from '../model/graph';
import { ConnectOperation } from './suggestions';
import type { ColumnTypeInfo } from './typeInference';

export interface ColumnRef {
  nodeId: string;
  column: string;
}

export interface ConnectContext {
  columnsOf(nodeId: string): string[];
  typeOf(nodeId: string, column: string): ColumnTypeInfo | undefined;
  /** Nome legível do nó (nome da planilha). */
  nameOf(nodeId: string): string;
  /** Primeiro valor preenchido da coluna, usado como valor inicial de filtros. */
  sampleOf?(nodeId: string, column: string): string | undefined;
}

export type ConnectOutcome =
  | { ok: true; graph: FlowGraph; focusId: string; outputId: string; createdIds: string[] }
  | { ok: false; error: string };

const AGG_BY_OP: Partial<Record<ConnectOperation, AggType>> = {
  sum: 'SUM',
  avg: 'AVG',
  count: 'COUNT',
  min: 'MIN',
  max: 'MAX',
};

const norm = (text: string): string => text.trim().toLowerCase();

/** Melhor coluna para agrupar na tabela de destino: mesmo nome da origem, depois chave, depois texto. */
export function pickGroupKey(
  columns: readonly string[],
  exclude: string,
  preferName: string,
  typeOf: (column: string) => ColumnTypeInfo | undefined
): string | null {
  const candidates = columns.filter(c => c !== exclude);
  const sameName = candidates.find(c => norm(c) === norm(preferName));
  if (sameName) return sameName;
  const byType = (type: string): string | undefined => candidates.find(c => typeOf(c)?.type === type);
  return byType('id') ?? byType('text') ?? null;
}

/** Coluna de retorno padrão de um lookup: a primeira que não é a chave, preferindo as que não são IDs. */
export function defaultReturnColumn(columns: readonly string[], key: string, typeOf: (c: string) => ColumnTypeInfo | undefined): string[] {
  const others = columns.filter(c => c !== key);
  const pick = others.find(c => typeOf(c)?.type !== 'id') ?? others[0];
  return pick ? [pick] : [];
}

function filterCondition(
  from: ColumnRef,
  info: ColumnTypeInfo | undefined,
  sample: string | undefined
): { column: string; operator: '>=' | 'contains' | '='; value: string } {
  if (info?.type === 'number' && info.numberRange) {
    return { column: from.column, operator: '>=', value: String(info.numberRange.min) };
  }
  if (info?.type === 'text') return { column: from.column, operator: 'contains', value: sample ?? '' };
  return { column: from.column, operator: '=', value: sample ?? '' };
}

function unwrap(result: EditResult): { graph: FlowGraph; id: string } | null {
  return result.ok ? { graph: result.graph, id: result.id } : null;
}

export function applyConnectOperation(
  graph: FlowGraph,
  from: ColumnRef,
  to: ColumnRef,
  op: ConnectOperation,
  ctx: ConnectContext
): ConnectOutcome {
  const fromNode = graph.nodes.find(n => n.id === from.nodeId);
  const toNode = graph.nodes.find(n => n.id === to.nodeId);
  if (!fromNode || !toNode) return { ok: false, error: 'Tabela não encontrada no fluxo' };

  let g = graph;
  const created: string[] = [];
  const fail = (error: string): ConnectOutcome => ({ ok: false, error });
  const baseX = Math.max(fromNode.x, toNode.x) + 400;
  const midY = Math.round((fromNode.y + toNode.y) / 2);

  const addTransform = (params: TransformParams, at: Point): string | null => {
    const added = unwrap(addTransformNode(g, params, at));
    if (!added) return null;
    g = added.graph;
    created.push(added.id);
    return added.id;
  };
  const link = (source: string, target: string, port: 'in' | 'lookup'): string | null => {
    const linked = connect(g, source, target, port);
    if (!linked.ok) return linked.error;
    g = linked.graph;
    return null;
  };
  const finish = (last: string, nameParts: string[]): ConnectOutcome => {
    const out = unwrap(addOutputNode(g, nameParts.join(' + '), { x: baseX + 420, y: midY }));
    if (!out) return fail('Limite de nós atingido');
    g = out.graph;
    created.push(out.id);
    const error = link(last, out.id, 'in');
    return error ? fail(error) : { ok: true, graph: g, focusId: last, outputId: out.id, createdIds: created };
  };

  const typeOfTo = (c: string) => ctx.typeOf(to.nodeId, c);
  const names = [ctx.nameOf(from.nodeId), ctx.nameOf(to.nodeId)];

  if (op === 'lookup') {
    const params: LookupParams = {
      op: 'lookup',
      sourceKey: from.column,
      lookupKey: to.column,
      returns: defaultReturnColumn(ctx.columnsOf(to.nodeId), to.column, typeOfTo),
      ifNotFound: '',
    };
    const id = addTransform(params, { x: baseX, y: midY });
    if (!id) return fail('Limite de nós atingido');
    const e1 = link(from.nodeId, id, 'in') ?? link(to.nodeId, id, 'lookup');
    return e1 ? fail(e1) : finish(id, names);
  }

  if (op === 'filter') {
    const sample = ctx.sampleOf?.(from.nodeId, from.column);
    const id = addTransform(
      { op: 'filter', conditions: [filterCondition(from, ctx.typeOf(from.nodeId, from.column), sample)] },
      { x: baseX, y: fromNode.y }
    );
    if (!id) return fail('Limite de nós atingido');
    const error = link(from.nodeId, id, 'in');
    return error ? fail(error) : finish(id, [names[0]]);
  }

  const agg = AGG_BY_OP[op];
  if (!agg) return fail('Operação desconhecida');

  const sameTable = from.nodeId === to.nodeId;
  const groupKey = sameTable
    ? from.column === to.column ? null : from.column
    : pickGroupKey(ctx.columnsOf(to.nodeId), to.column, from.column, typeOfTo);
  const outputName = `${agg}_${to.column}`;

  const aggParams: TransformParams = {
    op: 'aggregate',
    groupBy: groupKey ? [groupKey] : [],
    aggregations: [{ column: to.column, agg, outputName }],
  };
  const aggId = addTransform(aggParams, { x: baseX, y: toNode.y });
  if (!aggId) return fail('Limite de nós atingido');
  const e1 = link(to.nodeId, aggId, 'in');
  if (e1) return fail(e1);

  // SOMASE entre tabelas: devolve o total para cada linha da tabela de origem.
  if (!sameTable && groupKey) {
    const lookupParams: LookupParams = {
      op: 'lookup',
      sourceKey: from.column,
      lookupKey: groupKey,
      returns: [outputName],
      ifNotFound: agg === 'SUM' || agg === 'COUNT' ? '0' : '',
    };
    const lookupId = addTransform(lookupParams, { x: baseX + 340, y: fromNode.y });
    if (!lookupId) return fail('Limite de nós atingido');
    const e2 = link(from.nodeId, lookupId, 'in') ?? link(aggId, lookupId, 'lookup');
    return e2 ? fail(e2) : finish(lookupId, names);
  }
  return finish(aggId, [names[1]]);
}

export type PortConnectOutcome = { ok: true; graph: FlowGraph } | { ok: false; error: string };

/**
 * Liga uma saída (de tabela ou de transformação) a uma porta de nó. Quando a origem é um CAMPO de tabela,
 * infere os parâmetros ainda vazios do nó de destino:
 *  - lookup, porta `in`: o campo vira a chave de origem; porta `lookup`: vira a coluna de busca
 *    (e, se nada foi escolhido para retornar, escolhe a primeira coluna que não é a chave);
 *  - aggregate: campo numérico vira soma, senão vira agrupamento;
 *  - filter: o campo vira a primeira condição.
 * Parâmetros que o usuário já preencheu nunca são sobrescritos, exceto a chave da porta que acabou de ser ligada.
 */
export function connectColumnToPort(
  graph: FlowGraph,
  source: { nodeId: string; column?: string },
  targetId: string,
  port: FlowPort,
  ctx: ConnectContext
): PortConnectOutcome {
  const linked = connect(graph, source.nodeId, targetId, port);
  if (!linked.ok) return { ok: false, error: linked.error };
  let next = linked.graph;

  const target = next.nodes.find(n => n.id === targetId);
  if (!source.column || !target || target.kind !== 'transform') return { ok: true, graph: next };
  const column = source.column;
  const params = target.params;

  if (params.op === 'lookup') {
    if (port === 'in') {
      next = updateTransformParams(next, targetId, { ...params, sourceKey: column });
    } else {
      const typeOf = (c: string) => ctx.typeOf(source.nodeId, c);
      const returns = params.returns.length > 0
        ? params.returns.filter(r => r !== column)
        : defaultReturnColumn(ctx.columnsOf(source.nodeId), column, typeOf);
      next = updateTransformParams(next, targetId, { ...params, lookupKey: column, returns });
    }
  } else if (params.op === 'aggregate' && port === 'in') {
    const numeric = ctx.typeOf(source.nodeId, column)?.type === 'number';
    if (numeric && params.aggregations.length === 0) {
      next = updateTransformParams(next, targetId, {
        ...params,
        aggregations: [{ column, agg: 'SUM', outputName: `SUM_${column}` }],
      });
    } else if (!numeric && params.groupBy.length === 0) {
      next = updateTransformParams(next, targetId, { ...params, groupBy: [column] });
    }
  } else if (params.op === 'filter' && port === 'in' && params.conditions.length === 0) {
    const info = ctx.typeOf(source.nodeId, column);
    next = updateTransformParams(next, targetId, {
      ...params,
      conditions: [filterCondition({ nodeId: source.nodeId, column }, info, ctx.sampleOf?.(source.nodeId, column))],
    });
  }
  return { ok: true, graph: next };
}