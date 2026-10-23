// src/features/relations/runtime/scenarios.ts
// Motor de "e se" e viagem no tempo sobre o grafo (lógica pura, sem UI):
//  - stepThrough: estados do fluxo nó a nó, em ordem topológica (controle deslizante)
//  - forkScenario: aplica sobreposições a CÓPIAS (copy-on-write) e avalia
//  - compareScenarios: deltas por saída, linha a linha e agregados

import { CellData, Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, getCellValue, parseNumberSafely } from '../../../engine/formulaParser';
import { topologicalOrder } from '../model/dag';
import { FilterOperator, FlowGraph, FlowNode, TransformParams } from '../model/graph';
import { evaluateGraph, NodeResult, Row } from './evaluate';

// ---------- stepThrough ----------

export interface FlowStep {
  index: number;
  nodeId: string;
  kind: FlowNode['kind'];
  result: NodeResult;
  /** Nós já resolvidos neste passo (inclui o atual). */
  completed: string[];
}

export type StepThroughResult =
  | { ok: true; order: string[]; steps: FlowStep[] }
  | { ok: false; cycle: string[]; steps: [] };

/** Sequência de estados do fluxo, um por nó, na ordem em que o motor os executa. */
export function stepThrough(graph: FlowGraph, sheets: readonly Sheet[]): StepThroughResult {
  const order = topologicalOrder(graph);
  if (!order.ok) return { ok: false, cycle: order.cycle, steps: [] };
  const results = evaluateGraph(graph, sheets);
  const kinds = new Map(graph.nodes.map(n => [n.id, n.kind]));
  const steps = order.order.map<FlowStep>((nodeId, index) => ({
    index,
    nodeId,
    kind: kinds.get(nodeId)!,
    result: results.get(nodeId)!,
    completed: order.order.slice(0, index + 1),
  }));
  return { ok: true, order: order.order, steps };
}

// ---------- forkScenario ----------

export type ScenarioOverride =
  /** Multiplica os valores numéricos de uma coluna (por nome do cabeçalho). */
  | { kind: 'scaleColumn'; sheetId: string; column: string; factor: number }
  /** Mantém só as linhas que satisfazem a condição. */
  | { kind: 'filterRows'; sheetId: string; column: string; operator: FilterOperator; value: string }
  /** Troca os parâmetros de um nó de transformação. */
  | { kind: 'nodeParams'; nodeId: string; params: TransformParams };

export interface ScenarioRun {
  graph: FlowGraph;
  sheets: Sheet[];
  results: Map<string, NodeResult>;
}

function headerColumn(sheet: Sheet, name: string): number {
  for (let c = 0; c < sheet.colCount; c++) {
    const v = sheet.data[cellPosToKey(0, c)]?.value;
    if (v !== null && v !== undefined && String(v).trim() === name) return c;
  }
  return -1;
}

function matches(value: unknown, operator: FilterOperator, target: string): boolean {
  const text = value === null || value === undefined ? '' : String(value).trim();
  const a = parseNumberSafely(value);
  const b = parseNumberSafely(target);
  const numeric = a !== null && b !== null;
  switch (operator) {
    case '=': return numeric ? a === b : text.toLowerCase() === target.trim().toLowerCase();
    case '<>': return numeric ? a !== b : text.toLowerCase() !== target.trim().toLowerCase();
    case '>': return numeric ? a > b : text > target;
    case '<': return numeric ? a < b : text < target;
    case '>=': return numeric ? a >= b : text >= target;
    case '<=': return numeric ? a <= b : text <= target;
    case 'contains': return text.toLowerCase().includes(target.toLowerCase());
  }
}

function scaleColumn(sheet: Sheet, column: string, factor: number): Sheet {
  const col = headerColumn(sheet, column);
  if (col < 0) return sheet;
  const data: Record<string, CellData> = { ...sheet.data };
  for (let r = 1; r < sheet.rowCount; r++) {
    const key = cellPosToKey(r, col);
    const cell = data[key];
    if (!cell || cell.raw.startsWith('=')) continue;
    const n = parseNumberSafely(getCellValue(sheet, r, col));
    if (n === null) continue;
    const scaled = Math.round(n * factor * 1e9) / 1e9;
    data[key] = { ...cell, raw: String(scaled), value: scaled };
  }
  return { ...sheet, data };
}

function filterRows(sheet: Sheet, column: string, operator: FilterOperator, value: string): Sheet {
  const col = headerColumn(sheet, column);
  if (col < 0) return sheet;
  const data: Record<string, CellData> = {};
  for (let c = 0; c < sheet.colCount; c++) {
    const head = sheet.data[cellPosToKey(0, c)];
    if (head) data[cellPosToKey(0, c)] = head;
  }
  let next = 1;
  for (let r = 1; r < sheet.rowCount; r++) {
    if (!matches(getCellValue(sheet, r, col), operator, value)) continue;
    for (let c = 0; c < sheet.colCount; c++) {
      const cell = sheet.data[cellPosToKey(r, c)];
      if (cell) data[cellPosToKey(next, c)] = cell;
    }
    next++;
  }
  return { ...sheet, data, rowCount: Math.max(next, 2) };
}

/**
 * Cenário "e se": devolve novas planilhas/grafo (as originais nunca são alteradas; abas e nós sem
 * sobreposição mantêm a MESMA referência) e o resultado da avaliação.
 */
export function forkScenario(graph: FlowGraph, sheets: readonly Sheet[], overrides: readonly ScenarioOverride[]): ScenarioRun {
  let nextSheets: Sheet[] = [...sheets];
  let nextGraph = graph;

  for (const o of overrides) {
    if (o.kind === 'nodeParams') {
      nextGraph = {
        ...nextGraph,
        nodes: nextGraph.nodes.map(n => (n.id === o.nodeId && n.kind === 'transform' ? { ...n, params: o.params } : n)),
      };
      continue;
    }
    nextSheets = nextSheets.map(s => {
      if (s.id !== o.sheetId) return s;
      return o.kind === 'scaleColumn' ? scaleColumn(s, o.column, o.factor) : filterRows(s, o.column, o.operator, o.value);
    });
  }
  return { graph: nextGraph, sheets: nextSheets, results: evaluateGraph(nextGraph, nextSheets) };
}

// ---------- compareScenarios ----------

export interface ColumnDelta {
  column: string;
  sumA: number;
  sumB: number;
  delta: number;
  /** Variação percentual de A para B (null se A = 0). */
  percent: number | null;
}

export interface RowDelta {
  index: number;
  /** Diferença B - A por coluna numérica (ausente = sem mudança numérica). */
  changes: Record<string, { a: number | null; b: number | null; delta: number | null }>;
}

export interface OutputDelta {
  nodeId: string;
  errorA: string | null;
  errorB: string | null;
  rowsA: number;
  rowsB: number;
  columns: ColumnDelta[];
  rows: RowDelta[];
}

export interface ScenarioComparison {
  outputs: OutputDelta[];
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : parseNumberSafely(v));

function compareTables(nodeId: string, a: NodeResult | undefined, b: NodeResult | undefined): OutputDelta {
  const rowsA: Row[] = a?.table?.rows ?? [];
  const rowsB: Row[] = b?.table?.rows ?? [];
  const headers = [...new Set([...(a?.table?.headers ?? []), ...(b?.table?.headers ?? [])])];
  const numeric = headers.filter(h => [...rowsA, ...rowsB].some(r => num(r[h]) !== null));

  const columns: ColumnDelta[] = numeric.map(column => {
    const sum = (rows: Row[]) => rows.reduce((acc, r) => acc + (num(r[column]) ?? 0), 0);
    const sumA = sum(rowsA);
    const sumB = sum(rowsB);
    return { column, sumA, sumB, delta: sumB - sumA, percent: sumA === 0 ? null : ((sumB - sumA) / Math.abs(sumA)) * 100 };
  });

  const rows: RowDelta[] = [];
  const length = Math.max(rowsA.length, rowsB.length);
  for (let index = 0; index < length; index++) {
    const changes: RowDelta['changes'] = {};
    for (const column of numeric) {
      const va = rowsA[index] ? num(rowsA[index][column]) : null;
      const vb = rowsB[index] ? num(rowsB[index][column]) : null;
      if (va === vb) continue;
      changes[column] = { a: va, b: vb, delta: va !== null && vb !== null ? vb - va : null };
    }
    if (Object.keys(changes).length > 0) rows.push({ index, changes });
  }

  return {
    nodeId,
    errorA: a?.error ?? null,
    errorB: b?.error ?? null,
    rowsA: rowsA.length,
    rowsB: rowsB.length,
    columns,
    rows,
  };
}

/** Compara as saídas (nós `output`) de dois cenários, linha a linha (por posição) e em agregados. */
export function compareScenarios(a: ScenarioRun, b: ScenarioRun): ScenarioComparison {
  const ids = new Set<string>();
  for (const run of [a, b]) for (const n of run.graph.nodes) if (n.kind === 'output') ids.add(n.id);
  return { outputs: [...ids].map(id => compareTables(id, a.results.get(id), b.results.get(id))) };
}
