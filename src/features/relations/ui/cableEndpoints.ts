// src/features/relations/ui/cableEndpoints.ts
// Onde cada cabo começa e termina. A aresta do grafo não guarda coluna, então o campo de saída é DERIVADO
// dos parâmetros da transformação de destino (chave de busca, agrupamento, condição). Se o pino do campo
// não existe (cartão recolhido, zoom macro, campo filtrado), o cabo cai no pino da tabela inteira.

import { FlowEdge, FlowGraph, FlowNode } from '../model/graph';
import { anchorPosition, OffsetMap, Point } from './geometry';
import { LAYOUT } from './tokens';

/** Campo da tabela de origem de onde o cabo deve sair, ou null para o pino da tabela inteira. */
export function sourceColumnHint(graph: FlowGraph, edge: FlowEdge): string | null {
  const source = graph.nodes.find(n => n.id === edge.from);
  const target = graph.nodes.find(n => n.id === edge.to);
  if (source?.kind !== 'table' || target?.kind !== 'transform') return null;

  const p = target.params;
  let column: string | undefined;
  if (p.op === 'lookup') column = edge.toPort === 'lookup' ? p.lookupKey : p.sourceKey;
  else if (p.op === 'aggregate') column = p.groupBy[0] ?? p.aggregations[0]?.column;
  else column = p.conditions[0]?.column;
  return column ? column : null;
}

/** Deslocamentos de reserva (antes da primeira medição), em unidades de mundo. */
function fallbackOut(node: FlowNode): Point {
  if (node.kind === 'table') return { x: LAYOUT.cardWidth, y: 22 };
  if (node.kind === 'transform') return { x: LAYOUT.hexWidth - 3, y: LAYOUT.hexHeight / 2 };
  return { x: LAYOUT.outputWidth, y: 24 };
}

function fallbackIn(node: FlowNode, port: string): Point {
  if (node.kind === 'transform') {
    if (node.params.op !== 'lookup') return { x: 3, y: LAYOUT.hexHeight / 2 };
    return { x: 20, y: port === 'lookup' ? LAYOUT.hexHeight * 0.7 : LAYOUT.hexHeight * 0.3 };
  }
  return { x: 0, y: 24 };
}

export type AnchorTable = Readonly<Record<string, OffsetMap | undefined>>;

export function resolveEdgeEndpoints(
  graph: FlowGraph,
  edge: FlowEdge,
  anchors: AnchorTable
): { from: Point; to: Point } | null {
  const source = graph.nodes.find(n => n.id === edge.from);
  const target = graph.nodes.find(n => n.id === edge.to);
  if (!source || !target) return null;

  const column = sourceColumnHint(graph, edge);
  const outKeys = column ? [`out:${column}`, 'out:*'] : ['out:*'];
  return {
    from: anchorPosition(source, anchors[source.id], outKeys, fallbackOut(source)),
    to: anchorPosition(target, anchors[target.id], [`in:${edge.toPort}`], fallbackIn(target, edge.toPort)),
  };
}
