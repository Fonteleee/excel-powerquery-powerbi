// src/features/relations/model/editor.ts
// Operações PURAS de edição do grafo (adicionar, mover, ligar, remover).
// Toda função devolve um grafo novo; o original nunca é alterado. A camada de UI só chama estas funções.

import { topologicalOrder } from './dag';
import {
  AggregateParams,
  FilterParams,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowPort,
  FLOW_SHEET_PREFIX,
  LookupParams,
  OutputNode,
  TableNode,
  TransformNode,
  TransformParams,
} from './graph';
import { MAX_EDGES, MAX_NODES } from './schema';

const MAX_COORD = 1_000_000;
/** Passo horizontal entre cartões de tabela novos (largura do cartão + respiro). */
const TABLE_COLUMN_STEP = 340;

export interface Point {
  x: number;
  y: number;
}

/** Tamanho aproximado dos nós, usado só para evitar sobreposição ao posicionar novos nós. */
export const NODE_FOOTPRINT = { width: 320, height: 150 } as const;

export type EditResult =
  | { ok: true; graph: FlowGraph; id: string }
  | { ok: false; error: string };

/** Menor `prefixo-N` ainda não usado. Determinístico (sem relógio nem aleatório). */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

const clampCoord = (value: number): number =>
  Number.isFinite(value) ? Math.max(-MAX_COORD, Math.min(MAX_COORD, Math.round(value))) : 0;

const allIds = (graph: FlowGraph): string[] => [...graph.nodes.map(n => n.id), ...graph.edges.map(e => e.id)];

/** Procura um canto livre perto de `near`, descendo em degraus até não sobrepor outro nó. */
export function findFreeSpot(graph: FlowGraph, near: Point): Point {
  const x = clampCoord(near.x);
  let y = clampCoord(near.y);
  const overlaps = (py: number): boolean =>
    graph.nodes.some(
      n =>
        Math.abs(n.x - x) < NODE_FOOTPRINT.width * 0.6 && Math.abs(n.y - py) < NODE_FOOTPRINT.height * 0.6
    );
  for (let guard = 0; guard < 200 && overlaps(y); guard++) y += NODE_FOOTPRINT.height * 0.7;
  return { x, y: clampCoord(y) };
}

export function defaultParams(op: TransformParams['op']): TransformParams {
  if (op === 'lookup') {
    const params: LookupParams = { op: 'lookup', sourceKey: '', lookupKey: '', returns: [], ifNotFound: '' };
    return params;
  }
  if (op === 'aggregate') {
    const params: AggregateParams = { op: 'aggregate', groupBy: [], aggregations: [] };
    return params;
  }
  const params: FilterParams = { op: 'filter', conditions: [] };
  return params;
}

function withNode(graph: FlowGraph, node: FlowNode): EditResult {
  if (graph.nodes.length >= MAX_NODES) return { ok: false, error: `Limite de ${MAX_NODES} nós atingido` };
  return { ok: true, graph: { ...graph, nodes: [...graph.nodes, node] }, id: node.id };
}

/** Um nó de tabela por planilha: se já existe, devolve o existente. */
export function addTableNode(graph: FlowGraph, sheetId: string, at: Point): EditResult {
  const existing = graph.nodes.find((n): n is TableNode => n.kind === 'table' && n.sheetId === sheetId);
  if (existing) return { ok: true, graph, id: existing.id };
  const spot = findFreeSpot(graph, at);
  const node: TableNode = { id: uniqueId('tbl', allIds(graph)), kind: 'table', sheetId, x: spot.x, y: spot.y };
  return withNode(graph, node);
}

export function addTransformNode(graph: FlowGraph, params: TransformParams, at: Point): EditResult {
  const spot = findFreeSpot(graph, at);
  const node: TransformNode = { id: uniqueId('trf', allIds(graph)), kind: 'transform', params, x: spot.x, y: spot.y };
  return withNode(graph, node);
}

export function addOutputNode(graph: FlowGraph, sheetName: string, at: Point): EditResult {
  const spot = findFreeSpot(graph, at);
  const name = sheetName.trim().slice(0, 64) || 'Resultado';
  const node: OutputNode = {
    id: uniqueId('out', allIds(graph)),
    kind: 'output',
    sheetName: name,
    x: spot.x,
    y: spot.y,
  };
  return withNode(graph, node);
}

export function moveNode(graph: FlowGraph, id: string, x: number, y: number): FlowGraph {
  const cx = clampCoord(x);
  const cy = clampCoord(y);
  let changed = false;
  const nodes = graph.nodes.map(n => {
    if (n.id !== id || (n.x === cx && n.y === cy)) return n;
    changed = true;
    return { ...n, x: cx, y: cy };
  });
  return changed ? { ...graph, nodes } : graph;
}

/** Troca os parâmetros de uma transformação mantendo a operação. */
export function updateTransformParams(graph: FlowGraph, id: string, params: TransformParams): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === id && n.kind === 'transform' ? { ...n, params } : n)),
  };
}

export function renameOutput(graph: FlowGraph, id: string, sheetName: string): FlowGraph {
  const name = sheetName.slice(0, 64);
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === id && n.kind === 'output' ? { ...n, sheetName: name } : n)),
  };
}

/**
 * Troca a operação de uma transformação (lookup/aggregate/filter).
 * A aresta da porta `lookup` deixa de existir fora de transformações lookup e é removida.
 */
export function changeTransformOp(graph: FlowGraph, id: string, op: TransformParams['op']): FlowGraph {
  const target = graph.nodes.find(n => n.id === id);
  if (!target || target.kind !== 'transform' || target.params.op === op) return graph;
  const edges = op === 'lookup' ? graph.edges : graph.edges.filter(e => !(e.to === id && e.toPort === 'lookup'));
  return {
    ...graph,
    edges,
    nodes: graph.nodes.map(n => (n.id === id && n.kind === 'transform' ? { ...n, params: defaultParams(op) } : n)),
  };
}

export function removeNode(graph: FlowGraph, id: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== id),
    edges: graph.edges.filter(e => e.from !== id && e.to !== id),
  };
}

export function removeEdge(graph: FlowGraph, edgeId: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter(e => e.id !== edgeId) };
}

/** Motivo (em português) pelo qual a ligação é inválida, ou null se ela é permitida. */
export function connectionError(graph: FlowGraph, from: string, to: string, port: FlowPort): string | null {
  const source = graph.nodes.find(n => n.id === from);
  const target = graph.nodes.find(n => n.id === to);
  if (!source || !target) return 'Nó inexistente';
  if (from === to) return 'Um nó não pode ligar a ele mesmo';
  if (source.kind === 'output') return 'Uma saída não emite dados';
  if (target.kind === 'table') return 'Uma tabela de origem não recebe entrada';
  if (port === 'lookup' && !(target.kind === 'transform' && target.params.op === 'lookup')) {
    return 'A porta de busca só existe em transformações de busca';
  }
  if (target.kind === 'output' && port !== 'in') return 'A saída só tem a porta de entrada';

  // A aresta que ocupa a mesma porta será substituída, então não conta para o ciclo.
  const edges = graph.edges.filter(e => !(e.to === to && e.toPort === port));
  const candidate: FlowGraph = { ...graph, edges: [...edges, { id: '__probe__', from, to, toPort: port }] };
  if (!topologicalOrder(candidate).ok) return 'Essa ligação criaria um ciclo';
  return null;
}

/** Liga `from` à porta `port` de `to`. Substitui a aresta que já ocupava a mesma porta. */
export function connect(graph: FlowGraph, from: string, to: string, port: FlowPort): EditResult {
  const error = connectionError(graph, from, to, port);
  if (error) return { ok: false, error };

  const kept = graph.edges.filter(e => !(e.to === to && e.toPort === port));
  if (kept.length >= MAX_EDGES) return { ok: false, error: `Limite de ${MAX_EDGES} ligações atingido` };

  const same = graph.edges.find(e => e.from === from && e.to === to && e.toPort === port);
  if (same) return { ok: true, graph, id: same.id };

  const edge: FlowEdge = { id: uniqueId('edg', allIds(graph)), from, to, toPort: port };
  return { ok: true, graph: { ...graph, edges: [...kept, edge] }, id: edge.id };
}

/** Sheets mínimas necessárias para sincronizar nós de tabela. */
export interface SheetRef {
  id: string;
  name: string;
}

const isFlowSheet = (id: string): boolean => id.startsWith(FLOW_SHEET_PREFIX);

/**
 * Cria nós de tabela para planilhas ainda desconhecidas. Planilhas já "conhecidas" cujo nó
 * foi removido pelo usuário não voltam sozinhas. Abas geradas pelo próprio fluxo são ignoradas.
 */
export function syncTableNodes(
  graph: FlowGraph,
  sheets: readonly SheetRef[],
  known: readonly string[]
): { graph: FlowGraph; known: string[] } {
  const knownSet = new Set(known);
  const present = new Set(graph.nodes.filter((n): n is TableNode => n.kind === 'table').map(n => n.sheetId));
  let next = graph;
  let column = 0;
  // Cartões de tabela são altos: com nós existentes, as tabelas novas entram à DIREITA do último nó.
  const empty = graph.nodes.length === 0;
  const rightX = empty ? 60 : Math.max(...graph.nodes.map(n => n.x)) + TABLE_COLUMN_STEP;
  const topY = empty ? 60 : Math.min(...graph.nodes.map(n => n.y));

  for (const sheet of sheets) {
    if (isFlowSheet(sheet.id)) continue;
    if (knownSet.has(sheet.id)) continue;
    knownSet.add(sheet.id);
    if (present.has(sheet.id)) continue;
    const at = empty
      ? { x: 60 + (column % 3) * TABLE_COLUMN_STEP, y: 60 + Math.floor(column / 3) * 420 }
      : { x: rightX + column * TABLE_COLUMN_STEP, y: topY };
    column++;
    const added = addTableNode(next, sheet.id, at);
    if (added.ok) next = added.graph;
  }
  return { graph: next, known: [...knownSet] };
}

/** Caixa que envolve todos os nós (para "ajustar à tela"). Null se o grafo está vazio. */
export function graphBounds(
  graph: FlowGraph,
  size: { width: number; height: number } = NODE_FOOTPRINT
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (graph.nodes.length === 0) return null;
  return {
    minX: Math.min(...graph.nodes.map(n => n.x)),
    minY: Math.min(...graph.nodes.map(n => n.y)),
    maxX: Math.max(...graph.nodes.map(n => n.x)) + size.width,
    maxY: Math.max(...graph.nodes.map(n => n.y)) + size.height,
  };
}
