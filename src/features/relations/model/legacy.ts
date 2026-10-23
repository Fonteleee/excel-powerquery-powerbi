// src/features/relations/model/legacy.ts
// Migração das relações antigas (`RelationEdge`, salvas em localStorage) para o grafo declarativo.
//
// ESTRATÉGIA (sem duplicar colunas já materializadas):
//  - As planilhas do usuário NUNCA são tocadas. As fórmulas que a versão antiga gravou continuam
//    nas colunas onde estão; a migração não as remove nem as recria.
//  - Cada relação convertível vira uma cadeia  tabela -> transformação -> saída. A saída é uma aba
//    `flow-out-<id>` separada (materialização idempotente), então o resultado equivalente existe
//    em UM lugar novo e controlado pelo grafo, sem escrever uma segunda coluna na planilha original.
//  - Relações que não têm equivalente no grafo (matemática entre colunas, concatenação, FILTRO de várias
//    linhas, linha de total...) são listadas em `skipped` com o motivo. Elas continuam valendo como estão,
//    como fórmulas na planilha.
//  - A conversão é idempotente: os ids dos nós derivam do id da relação; rodar duas vezes não duplica.
//  - Quem chama decide o que fazer com as relações antigas (a UI oferece "Reconstruir como fluxo" e marca
//    `legacyHandled`; os dados legados em localStorage ficam intactos).
//    SOMASE/MÉDIASE/CONT.SE viram  agregação (na tabela de busca) + lookup (na tabela de origem).

import { Sheet } from '../../../types/spreadsheet';
import { RelationEdge, RelationFormulaType } from '../../../types/relations';
import { getColumnHeaderName } from '../../../engine/relationFormulaEngine';
import { addTableNode, addTransformNode, connect, Point } from './editor';
import { AggType, createEmptyGraph, FlowGraph, FORBIDDEN_KEYS, OutputNode, TransformParams } from './graph';
import { MAX_NODES } from './schema';

export interface LegacyConversion {
  edgeId: string;
  nodeIds: string[];
}

export interface LegacySkip {
  edgeId: string;
  reason: string;
}

export interface LegacyMigrationResult {
  graph: FlowGraph;
  converted: LegacyConversion[];
  skipped: LegacySkip[];
}

const LOOKUP_TYPES: readonly RelationFormulaType[] = ['PROCX', 'PROCV', 'JOIN_ETL'];
const AGG_BY_TYPE: Partial<Record<RelationFormulaType, AggType>> = {
  SOMASE: 'SUM',
  MEDIASE: 'AVG',
  'CONT.SE': 'COUNT',
};

const SKIP_REASON: Partial<Record<RelationFormulaType, string>> = {
  SUM_COLS: 'Soma entre colunas da mesma planilha fica como fórmula na planilha',
  SUB_COLS: 'Subtração entre colunas da mesma planilha fica como fórmula na planilha',
  MULT_COLS: 'Multiplicação entre colunas da mesma planilha fica como fórmula na planilha',
  DIV_COLS: 'Divisão entre colunas da mesma planilha fica como fórmula na planilha',
  PCT_DIFF: 'Variação percentual fica como fórmula na planilha',
  CONCAT: 'Concatenação de colunas fica como fórmula na planilha',
  IF_COMPARE: 'Comparação condicional fica como fórmula na planilha',
  ROW_LAG: 'Variação entre linhas fica como fórmula na planilha',
  RUNNING_TOTAL: 'Total acumulado fica como fórmula na planilha',
  UNIRTEXTO: 'Texto unido de várias linhas ainda não tem nó equivalente',
  FILTRO: 'FILTRO devolve várias linhas e ainda não tem nó equivalente',
};

/** Id seguro para o schema do grafo (letras, números, "_" e "-"). */
function safeId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 40) || 'x';
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

interface Draft {
  graph: FlowGraph;
  nodeIds: string[];
}

function addTransform(draft: Draft, params: TransformParams, at: Point): string | null {
  const added = addTransformNode(draft.graph, params, at);
  if (!added.ok) return null;
  draft.graph = added.graph;
  draft.nodeIds.push(added.id);
  return added.id;
}

function link(draft: Draft, from: string, to: string, port: 'in' | 'lookup'): boolean {
  const linked = connect(draft.graph, from, to, port);
  if (!linked.ok) return false;
  draft.graph = linked.graph;
  return true;
}

/**
 * Converte relações legadas em nós e arestas. `base` é o grafo atual (a conversão acrescenta, nunca apaga).
 * Relações já convertidas antes (mesmo id) são devolvidas em `skipped` com o motivo "já convertida".
 */
export function migrateLegacyEdges(
  edges: readonly RelationEdge[],
  sheets: readonly Sheet[],
  base: FlowGraph = createEmptyGraph()
): LegacyMigrationResult {
  const converted: LegacyConversion[] = [];
  const skipped: LegacySkip[] = [];
  const sheetById = new Map(sheets.map(s => [s.id, s]));
  let graph = base;

  let slot = 0;
  const startY = graph.nodes.length === 0 ? 60 : Math.max(...graph.nodes.map(n => n.y)) + 300;

  for (const edge of edges) {
    // O id do nó de saída deriva do id da relação: é a marca de que ela já foi convertida.
    const outId = `lg-${safeId(edge.id)}`;
    if (graph.nodes.some(n => n.id === outId)) {
      skipped.push({ edgeId: edge.id, reason: 'Já convertida anteriormente' });
      continue;
    }

    const isLookup = LOOKUP_TYPES.includes(edge.formulaType);
    const agg = AGG_BY_TYPE[edge.formulaType];
    if (!isLookup && !agg) {
      skipped.push({ edgeId: edge.id, reason: SKIP_REASON[edge.formulaType] ?? 'Tipo de relação sem equivalente' });
      continue;
    }
    if (edge.outputDestination === 'below_row') {
      skipped.push({ edgeId: edge.id, reason: 'Linha de total fica como fórmula na planilha' });
      continue;
    }

    const source = sheetById.get(edge.sourceSheetId);
    const target = sheetById.get(edge.targetSheetId);
    if (!source || !target) {
      skipped.push({ edgeId: edge.id, reason: 'A planilha da relação não existe mais' });
      continue;
    }

    const sourceKey = getColumnHeaderName(source, edge.sourceColIdx);
    const targetKey = getColumnHeaderName(target, edge.targetColIdx);
    const returnCol = getColumnHeaderName(target, edge.returnColIdx);
    if ([sourceKey, targetKey, returnCol].some(h => FORBIDDEN_KEYS.has(h))) {
      skipped.push({ edgeId: edge.id, reason: 'Nome de coluna não permitido' });
      continue;
    }

    const y = startY + slot * 320;
    const draft: Draft = { graph, nodeIds: [] };

    const srcNode = addTableNode(draft.graph, source.id, { x: 60, y });
    if (!srcNode.ok) {
      skipped.push({ edgeId: edge.id, reason: 'Limite de nós atingido' });
      continue;
    }
    draft.graph = srcNode.graph;
    const tgtNode = addTableNode(draft.graph, target.id, { x: 60, y: y + 320 });
    if (!tgtNode.ok) {
      skipped.push({ edgeId: edge.id, reason: 'Limite de nós atingido' });
      continue;
    }
    draft.graph = tgtNode.graph;

    let resultNode: string | null;
    if (isLookup) {
      resultNode = addTransform(
        draft,
        {
          op: 'lookup',
          sourceKey,
          lookupKey: targetKey,
          returns: [returnCol],
          ifNotFound: edge.ifNotFound ?? '',
          prefix: target.name,
        },
        { x: 520, y }
      );
      if (resultNode) {
        link(draft, srcNode.id, resultNode, 'in');
        link(draft, tgtNode.id, resultNode, 'lookup');
      }
    } else {
      const valueCol = agg === 'COUNT' ? targetKey : returnCol;
      const outputName = `${agg}_${valueCol}`;
      const aggregateNode = addTransform(
        draft,
        { op: 'aggregate', groupBy: [targetKey], aggregations: [{ column: valueCol, agg: agg!, outputName }] },
        { x: 520, y: y + 320 }
      );
      resultNode = addTransform(
        draft,
        {
          op: 'lookup',
          sourceKey,
          lookupKey: targetKey,
          returns: [outputName],
          ifNotFound: edge.ifNotFound ?? (agg === 'AVG' ? '' : '0'),
        },
        { x: 960, y }
      );
      if (aggregateNode && resultNode) {
        link(draft, tgtNode.id, aggregateNode, 'in');
        link(draft, srcNode.id, resultNode, 'in');
        link(draft, aggregateNode, resultNode, 'lookup');
      }
    }

    if (!resultNode) {
      skipped.push({ edgeId: edge.id, reason: 'Limite de nós atingido' });
      continue;
    }

    const outName = clip(`Fluxo - ${source.name} + ${target.name} (${edge.formulaType})`, 60);
    if (draft.graph.nodes.length >= MAX_NODES) {
      skipped.push({ edgeId: edge.id, reason: 'Limite de nós atingido' });
      continue;
    }
    const output: OutputNode = { id: outId, kind: 'output', sheetName: outName, x: agg ? 1400 : 960, y };
    draft.graph = { ...draft.graph, nodes: [...draft.graph.nodes, output] };
    draft.nodeIds.push(outId);
    link(draft, resultNode, outId, 'in');

    graph = draft.graph;
    converted.push({ edgeId: edge.id, nodeIds: draft.nodeIds });
    slot++;
  }

  return { graph, converted, skipped };
}
