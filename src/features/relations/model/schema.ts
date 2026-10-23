// src/features/relations/model/schema.ts
// Validação estrita de qualquer grafo vindo de fora (localStorage, importação, IA).
// Copia apenas campos conhecidos (anti mass-assignment) e nunca devolve o objeto original.

import { topologicalOrder } from './dag';
import {
  AggType,
  FilterOperator,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowPort,
  FLOW_GRAPH_VERSION,
  FORBIDDEN_KEYS,
  TransformParams,
} from './graph';

export const MAX_NODES = 500;
export const MAX_EDGES = 2000;
const MAX_STRING = 256;
const MAX_LIST = 100;
const MAX_COORD = 1_000_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const AGG_TYPES: readonly AggType[] = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
const OPERATORS: readonly FilterOperator[] = ['=', '<>', '>', '<', '>=', '<=', 'contains'];
const PORTS: readonly FlowPort[] = ['in', 'lookup'];

export type ParseResult =
  | { ok: true; graph: FlowGraph }
  | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Collector {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    if (this.errors.length < 20) this.errors.push(`${path}: ${message}`);
  }

  text(value: unknown, path: string, opts: { allowEmpty?: boolean; column?: boolean } = {}): string {
    if (typeof value !== 'string') {
      this.fail(path, 'deve ser texto');
      return '';
    }
    if (value.length > MAX_STRING) this.fail(path, `excede ${MAX_STRING} caracteres`);
    if (!opts.allowEmpty && value.trim() === '') this.fail(path, 'não pode ser vazio');
    if (opts.column && FORBIDDEN_KEYS.has(value)) this.fail(path, `nome de coluna proibido "${value}"`);
    return value;
  }

  optionalText(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : this.text(value, path, { allowEmpty: true });
  }

  id(value: unknown, path: string): string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      this.fail(path, 'id inválido (use letras, números, "_" ou "-", até 64 caracteres)');
      return '';
    }
    return value;
  }

  coord(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_COORD) {
      this.fail(path, 'coordenada inválida');
      return 0;
    }
    return value;
  }

  list(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'deve ser uma lista');
      return [];
    }
    if (value.length > MAX_LIST) {
      this.fail(path, `excede ${MAX_LIST} itens`);
      return value.slice(0, MAX_LIST);
    }
    return value;
  }

  oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string, fallback: T): T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    this.fail(path, `valor inválido (esperado: ${allowed.join(', ')})`);
    return fallback;
  }
}

function parseParams(raw: unknown, path: string, c: Collector): TransformParams {
  const fallback: TransformParams = { op: 'filter', conditions: [] };
  if (!isRecord(raw)) {
    c.fail(path, 'deve ser um objeto');
    return fallback;
  }

  if (raw.op === 'lookup') {
    return {
      op: 'lookup',
      sourceKey: c.text(raw.sourceKey, `${path}.sourceKey`, { column: true }),
      lookupKey: c.text(raw.lookupKey, `${path}.lookupKey`, { column: true }),
      returns: c.list(raw.returns, `${path}.returns`).map((v, i) =>
        c.text(v, `${path}.returns[${i}]`, { column: true })
      ),
      ifNotFound: c.text(raw.ifNotFound ?? '', `${path}.ifNotFound`, { allowEmpty: true }),
      prefix: c.optionalText(raw.prefix, `${path}.prefix`),
    };
  }

  if (raw.op === 'aggregate') {
    return {
      op: 'aggregate',
      groupBy: c.list(raw.groupBy, `${path}.groupBy`).map((v, i) =>
        c.text(v, `${path}.groupBy[${i}]`, { column: true })
      ),
      aggregations: c.list(raw.aggregations, `${path}.aggregations`).map((v, i) => {
        const p = `${path}.aggregations[${i}]`;
        if (!isRecord(v)) {
          c.fail(p, 'deve ser um objeto');
          return { column: '', agg: 'SUM' as AggType };
        }
        return {
          column: c.text(v.column, `${p}.column`, { column: true }),
          agg: c.oneOf(v.agg, AGG_TYPES, `${p}.agg`, 'SUM'),
          outputName:
            v.outputName === undefined
              ? undefined
              : c.text(v.outputName, `${p}.outputName`, { column: true }),
        };
      }),
    };
  }

  if (raw.op === 'filter') {
    return {
      op: 'filter',
      conditions: c.list(raw.conditions, `${path}.conditions`).map((v, i) => {
        const p = `${path}.conditions[${i}]`;
        if (!isRecord(v)) {
          c.fail(p, 'deve ser um objeto');
          return { column: '', operator: '=' as FilterOperator, value: '' };
        }
        return {
          column: c.text(v.column, `${p}.column`, { column: true }),
          operator: c.oneOf(v.operator, OPERATORS, `${p}.operator`, '='),
          value: c.text(v.value ?? '', `${p}.value`, { allowEmpty: true }),
        };
      }),
    };
  }

  c.fail(`${path}.op`, 'operação desconhecida (esperado: lookup, aggregate, filter)');
  return fallback;
}

function parseNode(raw: unknown, index: number, c: Collector): FlowNode | null {
  const path = `nodes[${index}]`;
  if (!isRecord(raw)) {
    c.fail(path, 'deve ser um objeto');
    return null;
  }

  const base = {
    id: c.id(raw.id, `${path}.id`),
    x: c.coord(raw.x, `${path}.x`),
    y: c.coord(raw.y, `${path}.y`),
    label: c.optionalText(raw.label, `${path}.label`),
  };

  if (raw.kind === 'table') {
    return { ...base, kind: 'table', sheetId: c.text(raw.sheetId, `${path}.sheetId`) };
  }
  if (raw.kind === 'transform') {
    return { ...base, kind: 'transform', params: parseParams(raw.params, `${path}.params`, c) };
  }
  if (raw.kind === 'output') {
    return { ...base, kind: 'output', sheetName: c.text(raw.sheetName, `${path}.sheetName`) };
  }
  c.fail(`${path}.kind`, 'tipo de nó desconhecido (esperado: table, transform, output)');
  return null;
}

/** Valida e normaliza um grafo desconhecido. Nunca lança exceção. */
export function parseFlowGraph(input: unknown): ParseResult {
  const c = new Collector();

  if (!isRecord(input)) return { ok: false, errors: ['grafo: deve ser um objeto'] };
  if (input.version !== FLOW_GRAPH_VERSION) {
    return { ok: false, errors: [`version: esperado ${FLOW_GRAPH_VERSION}`] };
  }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return { ok: false, errors: ['nodes e edges devem ser listas'] };
  }
  if (input.nodes.length > MAX_NODES) return { ok: false, errors: [`mais de ${MAX_NODES} nós`] };
  if (input.edges.length > MAX_EDGES) return { ok: false, errors: [`mais de ${MAX_EDGES} arestas`] };

  const nodes: FlowNode[] = [];
  const nodeIds = new Set<string>();
  input.nodes.forEach((raw, i) => {
    const node = parseNode(raw, i, c);
    if (!node) return;
    if (nodeIds.has(node.id)) c.fail(`nodes[${i}].id`, `id duplicado "${node.id}"`);
    nodeIds.add(node.id);
    nodes.push(node);
  });

  const edges: FlowEdge[] = [];
  const edgeIds = new Set<string>();
  const usedPorts = new Set<string>();
  input.edges.forEach((raw, i) => {
    const path = `edges[${i}]`;
    if (!isRecord(raw)) {
      c.fail(path, 'deve ser um objeto');
      return;
    }
    const edge: FlowEdge = {
      id: c.id(raw.id, `${path}.id`),
      from: c.id(raw.from, `${path}.from`),
      to: c.id(raw.to, `${path}.to`),
      toPort: c.oneOf(raw.toPort ?? 'in', PORTS, `${path}.toPort`, 'in'),
    };
    if (edgeIds.has(edge.id)) c.fail(`${path}.id`, `id duplicado "${edge.id}"`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from)) c.fail(`${path}.from`, `nó inexistente "${edge.from}"`);
    if (!nodeIds.has(edge.to)) c.fail(`${path}.to`, `nó inexistente "${edge.to}"`);
    if (edge.from === edge.to) c.fail(path, 'aresta não pode ligar um nó a ele mesmo');
    const portKey = `${edge.to}:${edge.toPort}`;
    if (usedPorts.has(portKey)) c.fail(path, `a porta "${edge.toPort}" de "${edge.to}" já tem uma entrada`);
    usedPorts.add(portKey);
    edges.push(edge);
  });

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const target = nodeById.get(edge.to);
    if (!target) continue;
    if (target.kind === 'table') c.fail(`edge ${edge.id}`, 'nó de tabela não recebe entrada');
    if (edge.toPort === 'lookup' && !(target.kind === 'transform' && target.params.op === 'lookup')) {
      c.fail(`edge ${edge.id}`, 'a porta "lookup" só existe em transformações lookup');
    }
    if (nodeById.get(edge.from)?.kind === 'output') c.fail(`edge ${edge.id}`, 'nó de saída não emite dados');
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };

  const graph: FlowGraph = { version: FLOW_GRAPH_VERSION, nodes, edges };
  const order = topologicalOrder(graph);
  if (!order.ok) return { ok: false, errors: [`o grafo tem ciclo envolvendo: ${order.cycle.join(', ')}`] };
  return { ok: true, graph };
}
