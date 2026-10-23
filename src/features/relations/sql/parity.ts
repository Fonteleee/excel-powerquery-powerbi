// src/features/relations/sql/parity.ts
// Teste de paridade: executa o SQL gerado em QUALQUER motor (injetado) e compara, linha a linha,
// com o resultado do `evaluateGraph`. No Node roda com DuckDB-WASM (ver testing/duckdbNode.ts);
// no navegador basta passar um executor que use o DuckDB-WASM do app.

import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph } from '../model/graph';
import { Cell, evaluateGraph } from '../runtime/evaluate';
import { CompileOptions } from './compile';
import { exportFlowAsSql } from './index';

export type SqlRow = Record<string, unknown>;

/** Executa UMA instrução SQL e devolve as linhas (vazio para DDL/INSERT). */
export type SqlExecutor = (sql: string) => Promise<SqlRow[]> | SqlRow[];

export interface ParityMismatch {
  row: number;
  column: string;
  expected: unknown;
  actual: unknown;
}

export interface ParityTargetReport {
  nodeId: string;
  expectedRows: number;
  actualRows: number;
  headersMatch: boolean;
  mismatches: ParityMismatch[];
}

export interface ParityReport {
  ok: boolean;
  /** Erros de compilação ou de execução (o SQL não rodou). */
  errors: string[];
  targets: ParityTargetReport[];
}

const MAX_MISMATCHES = 20;
const TOLERANCE = 1e-9;

/** Forma comparável: vazio e nulo são iguais; "60" e 60 também; texto como veio. */
export function canonicalCell(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const text = String(value);
  const asNumber = Number(text);
  return text.trim() !== '' && Number.isFinite(asNumber) && String(asNumber) === text ? asNumber : text;
}

export function cellsMatch(expected: unknown, actual: unknown): boolean {
  const a = canonicalCell(expected);
  const b = canonicalCell(actual);
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a === b;
}

export async function checkSqlParity(
  graph: FlowGraph,
  sheets: readonly Sheet[],
  run: SqlExecutor,
  options: Omit<CompileOptions, 'dialect' | 'outputMode' | 'includeInputs'> = {}
): Promise<ParityReport> {
  const exported = exportFlowAsSql(graph, sheets, { ...options, dialect: 'duckdb', outputMode: 'select' });
  if (!exported.ok) return { ok: false, errors: exported.errors, targets: [] };

  const evaluated = evaluateGraph(graph, sheets);
  const targets: ParityTargetReport[] = [];

  try {
    for (const statement of exported.setup) await run(statement);
    for (const query of exported.queries) {
      const expected = evaluated.get(query.nodeId);
      if (!expected?.table) {
        return { ok: false, errors: [`O motor em JS falhou em "${query.label}": ${expected?.error ?? 'sem resultado'}`], targets };
      }
      const actualRows = await run(query.sql);
      const headersMatch =
        query.headers.length === expected.table.headers.length &&
        query.headers.every((h, i) => h === expected.table!.headers[i]);

      const mismatches: ParityMismatch[] = [];
      const limit = Math.min(actualRows.length, expected.table.rows.length);
      for (let i = 0; i < limit && mismatches.length < MAX_MISMATCHES; i++) {
        for (const column of expected.table.headers) {
          const expectedCell: Cell = expected.table.rows[i][column];
          if (!cellsMatch(expectedCell, actualRows[i][column])) {
            mismatches.push({ row: i, column, expected: expectedCell, actual: actualRows[i][column] });
            if (mismatches.length >= MAX_MISMATCHES) break;
          }
        }
      }
      targets.push({
        nodeId: query.nodeId,
        expectedRows: expected.table.rows.length,
        actualRows: actualRows.length,
        headersMatch,
        mismatches,
      });
    }
  } catch (error) {
    return { ok: false, errors: [`Falha ao executar o SQL: ${error instanceof Error ? error.message : String(error)}`], targets };
  }

  const ok = targets.every(t => t.headersMatch && t.expectedRows === t.actualRows && t.mismatches.length === 0);
  return { ok, errors: [], targets };
}
