// src/features/relations/runtime/evaluate.ts
// Avaliação PURA do grafo: recebe grafo + planilhas e devolve uma tabela por nó.
// Não grava nada nas planilhas. Serve ao preview, à materialização, ao SQL e à IA.

import { Sheet } from '../../../types/spreadsheet';
import { cellPosToKey } from '../../../engine/formulaParser';
import { executeFilter, executeGroupBy, extractSheetRecords } from '../../../engine/pipelineEngine';
import { inputsOf, topologicalOrder } from '../model/dag';
import {
  AggregateParams,
  FilterParams,
  FlowGraph,
  FlowNode,
  FORBIDDEN_KEYS,
  LookupParams,
} from '../model/graph';

export type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

export interface FlowTable {
  headers: string[];
  rows: Row[];
}

export type Cardinality = '1:1' | 'N:1' | '1:N' | 'N:N';

/** Resultado do "pré-join scan": qualidade do cruzamento de uma transformação lookup. */
export interface LookupStats {
  sourceRows: number;
  matched: number;
  orphans: number;
  matchRate: number; // 0 a 100
  duplicateLookupKeys: number;
  cardinality: Cardinality;
}

export interface NodeResult {
  table: FlowTable | null;
  error: string | null;
  /** Em erros herdados de um nó anterior, o motivo original (vem do primeiro nó que falhou). */
  rootCause?: string;
  lookup?: LookupStats;
}

export interface EvaluateOptions {
  /** Resultados anteriores: nós fora de `dirty` são reaproveitados sem recalcular. */
  previous?: ReadonlyMap<string, NodeResult>;
  dirty?: ReadonlySet<string>;
}

const fail = (error: string): NodeResult => ({ table: null, error });

/** Erro herdado: mantém o motivo original do primeiro nó que falhou. */
const failFrom = (error: string, upstream: NodeResult | undefined): NodeResult => ({
  table: null,
  error,
  rootCause: upstream?.rootCause ?? upstream?.error ?? undefined,
});

function normalizeKey(value: Cell): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim().toLowerCase();
}

function missingColumns(table: FlowTable, columns: string[]): string[] {
  const known = new Set(table.headers);
  return columns.filter(c => !known.has(c));
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

const isFilled = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

function evaluateTable(sheet: Sheet | undefined, sheetId: string): NodeResult {
  if (!sheet) return fail(`Planilha "${sheetId}" não encontrada`);
  const extracted = extractSheetRecords(sheet);
  const bad = extracted.headers.find(h => FORBIDDEN_KEYS.has(h));
  if (bad) return fail(`Cabeçalho proibido "${bad}" na planilha "${sheet.name}"`);

  // A planilha reserva colunas vazias (Coluna_D, Coluna_E...). Só entram as que têm cabeçalho ou dados.
  const kept = extracted.headers.filter((header, col) => {
    const explicit = isFilled(sheet.data[cellPosToKey(0, col)]?.value);
    return explicit || extracted.rows.some(row => isFilled(row[header]));
  });
  const rows = extracted.rows.map(row => {
    const slim: Row = {};
    for (const header of kept) slim[header] = row[header];
    return slim;
  });
  return { table: { headers: kept, rows }, error: null };
}

function evaluateLookup(params: LookupParams, source: FlowTable, lookup: FlowTable): NodeResult {
  const missingSource = missingColumns(source, [params.sourceKey]);
  if (missingSource.length > 0) return fail(`Coluna "${missingSource[0]}" não encontrada na tabela de origem`);
  const missingLookup = missingColumns(lookup, [params.lookupKey, ...params.returns]);
  if (missingLookup.length > 0) return fail(`Coluna "${missingLookup[0]}" não encontrada na tabela de busca`);

  // Primeira ocorrência vence, como no PROCX/PROCV.
  const index = new Map<string, Row>();
  let duplicateLookupKeys = 0;
  for (const row of lookup.rows) {
    const key = normalizeKey(row[params.lookupKey]);
    if (key === null) continue;
    if (index.has(key)) duplicateLookupKeys++;
    else index.set(key, row);
  }

  const used = new Set(source.headers);
  const outputNames = params.returns.map(h => {
    const name = uniqueName(params.prefix ? `${params.prefix} - ${h}` : h, used);
    used.add(name);
    return name;
  });

  const sourceKeys = new Set<string>();
  let duplicateSourceKeys = 0;
  let sourceRows = 0;
  let matched = 0;

  const rows: Row[] = source.rows.map(row => {
    const out: Row = { ...row };
    const key = normalizeKey(row[params.sourceKey]);
    const hit = key === null ? undefined : index.get(key);

    if (key !== null) {
      sourceRows++;
      if (sourceKeys.has(key)) duplicateSourceKeys++;
      else sourceKeys.add(key);
      if (hit) matched++;
    }

    params.returns.forEach((h, i) => {
      out[outputNames[i]] = hit ? hit[h] : params.ifNotFound;
    });
    return out;
  });

  const sourceUnique = duplicateSourceKeys === 0;
  const lookupUnique = duplicateLookupKeys === 0;
  const cardinality: Cardinality = sourceUnique
    ? lookupUnique ? '1:1' : '1:N'
    : lookupUnique ? 'N:1' : 'N:N';

  return {
    table: { headers: [...source.headers, ...outputNames], rows },
    error: null,
    lookup: {
      sourceRows,
      matched,
      orphans: sourceRows - matched,
      matchRate: sourceRows > 0 ? (matched / sourceRows) * 100 : 100,
      duplicateLookupKeys,
      cardinality,
    },
  };
}

function evaluateAggregate(params: AggregateParams, input: FlowTable): NodeResult {
  const columns = [...params.groupBy, ...params.aggregations.map(a => a.column)];
  const missing = missingColumns(input, columns);
  if (missing.length > 0) return fail(`Coluna "${missing[0]}" não encontrada`);

  const aggregations = params.aggregations.map(a => ({
    colName: a.column,
    aggType: a.agg,
    outputName: a.outputName || `${a.agg}_${a.column}`,
  }));
  const headers = [...params.groupBy, ...aggregations.map(a => a.outputName)];
  if (input.rows.length === 0) return { table: { headers, rows: [] }, error: null };

  const result = executeGroupBy(input.rows, params.groupBy, aggregations);
  return { table: { headers: result.headers, rows: result.rows }, error: null };
}

function evaluateFilter(params: FilterParams, input: FlowTable): NodeResult {
  const missing = missingColumns(input, params.conditions.map(c => c.column));
  if (missing.length > 0) return fail(`Coluna "${missing[0]}" não encontrada`);

  const conditions = params.conditions.map(c => ({ colName: c.column, operator: c.operator, value: c.value }));
  return { table: { headers: input.headers, rows: executeFilter(input.rows, conditions) }, error: null };
}

function evaluateNode(
  node: FlowNode,
  graph: FlowGraph,
  sheets: ReadonlyMap<string, Sheet>,
  results: ReadonlyMap<string, NodeResult>
): NodeResult {
  if (node.kind === 'table') return evaluateTable(sheets.get(node.sheetId), node.sheetId);

  const inputs = inputsOf(graph, node.id);
  const mainEdge = inputs.in;
  if (!mainEdge) return fail('Conecte uma entrada');
  const main = results.get(mainEdge.from);
  if (!main || main.error || !main.table) return failFrom('A entrada tem erro', main);

  if (node.kind === 'output') return { table: main.table, error: null };

  const { params } = node;
  if (params.op === 'aggregate') return evaluateAggregate(params, main.table);
  if (params.op === 'filter') return evaluateFilter(params, main.table);

  const lookupEdge = inputs.lookup;
  if (!lookupEdge) return fail('Conecte a tabela de busca');
  const lookup = results.get(lookupEdge.from);
  if (!lookup || lookup.error || !lookup.table) return failFrom('A tabela de busca tem erro', lookup);
  return evaluateLookup(params, main.table, lookup.table);
}

/** Avalia o grafo inteiro (ou só os nós sujos, quando `previous` e `dirty` são informados). */
export function evaluateGraph(
  graph: FlowGraph,
  sheets: readonly Sheet[],
  options: EvaluateOptions = {}
): Map<string, NodeResult> {
  const results = new Map<string, NodeResult>();
  const order = topologicalOrder(graph);
  if (!order.ok) {
    for (const node of graph.nodes) results.set(node.id, fail('O grafo tem ciclo'));
    return results;
  }

  const sheetById = new Map(sheets.map(s => [s.id, s]));
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  for (const id of order.order) {
    const cached = options.previous?.get(id);
    if (cached && options.dirty && !options.dirty.has(id)) {
      results.set(id, cached);
      continue;
    }
    results.set(id, evaluateNode(nodeById.get(id)!, graph, sheetById, results));
  }
  return results;
}

/** Amostra para o preview ao vivo. */
export function previewTable(table: FlowTable, limit = 10): FlowTable {
  return { headers: table.headers, rows: table.rows.slice(0, Math.max(0, limit)) };
}
