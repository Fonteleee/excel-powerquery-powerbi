// src/features/relations/sql/inputs.ts
// Tabelas de entrada do script: tipos inferidos das planilhas e CREATE TABLE/INSERT autocontidos.

import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph, FORBIDDEN_KEYS } from '../model/graph';
import { Cell, evaluateGraph, Row } from '../runtime/evaluate';
import { commentLine } from './dialects/common';
import { ColumnInfo, ColumnType, MAX_SCRIPT_CHARS, ROW_COLUMN, SqlDialect, SqlSafetyError } from './types';

/** Prefixo reservado dos nomes internos (CTEs). Nenhuma tabela física pode começar com ele. */
export const INTERNAL_PREFIX = '_flow_';

const INSERT_BATCH_ROWS = 200;

export interface InputTable {
  sheetId: string;
  sheetName: string;
  /** Nome físico da tabela no SQL (único, sem diferenciar maiúsculas). */
  sqlName: string;
  columns: ColumnInfo[];
  rows: Row[];
}

export interface PreparedInputs {
  tables: InputTable[];
  errors: string[];
}

export function inferColumnType(values: readonly Cell[]): ColumnType {
  let sawNumber = false;
  let sawBoolean = false;
  let sawText = false;
  let allIntegers = true;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      sawNumber = true;
      if (!Number.isSafeInteger(value)) allIntegers = false;
    } else if (typeof value === 'boolean') {
      sawBoolean = true;
    } else {
      sawText = true;
    }
  }
  if (sawText || (sawNumber && sawBoolean)) return 'varchar';
  if (sawNumber) return allIntegers ? 'bigint' : 'double';
  if (sawBoolean) return 'boolean';
  return 'varchar';
}

/** Gera um nome livre (sem diferenciar maiúsculas, pois o DuckDB não diferencia mesmo entre aspas). */
export function uniqueSqlName(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base} (${n++})`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Lê as planilhas referenciadas pelo grafo usando a mesma extração do `evaluateGraph`. */
export function prepareInputs(graph: FlowGraph, sheets: readonly Sheet[]): PreparedInputs {
  const tableNodes = graph.nodes.filter(node => node.kind === 'table');
  const onlyTables: FlowGraph = { version: graph.version, nodes: tableNodes, edges: [] };
  const results = evaluateGraph(onlyTables, sheets);
  const sheetById = new Map(sheets.map(sheet => [sheet.id, sheet]));

  const tables: InputTable[] = [];
  const errors: string[] = [];
  const used = new Set<string>();
  const seen = new Set<string>();

  for (const node of tableNodes) {
    if (node.kind !== 'table' || seen.has(node.sheetId)) continue;
    seen.add(node.sheetId);

    const result = results.get(node.id);
    if (!result || result.error || !result.table) {
      errors.push(result?.error ?? `Planilha "${node.sheetId}" indisponível`);
      continue;
    }

    const headers = result.table.headers;
    const problem = headers.find(h => h === ROW_COLUMN || h.startsWith('__flow_') || FORBIDDEN_KEYS.has(h));
    if (problem !== undefined) {
      errors.push(`Cabeçalho reservado "${problem}" na planilha "${sheetById.get(node.sheetId)?.name ?? node.sheetId}"`);
      continue;
    }
    if (new Set(headers).size !== headers.length) {
      errors.push(`Cabeçalhos duplicados na planilha "${sheetById.get(node.sheetId)?.name ?? node.sheetId}"`);
      continue;
    }

    const sheetName = sheetById.get(node.sheetId)?.name || node.sheetId;
    let base = sheetName;
    if (base.toLowerCase().startsWith(INTERNAL_PREFIX)) base = `tabela ${base}`;
    tables.push({
      sheetId: node.sheetId,
      sheetName,
      sqlName: uniqueSqlName(base, used),
      columns: headers.map(name => ({ name, type: inferColumnType(result.table!.rows.map(row => row[name])) })),
      rows: result.table.rows,
    });
  }
  return { tables, errors };
}

function cellLiteral(dialect: SqlDialect, type: ColumnType, value: Cell): string {
  if (value === null || value === undefined) return 'NULL';
  switch (type) {
    case 'varchar':
      return dialect.stringLiteral(String(value));
    case 'boolean':
      return dialect.booleanLiteral(value === true);
    case 'bigint':
    case 'double':
      return dialect.numberLiteral(Number(value));
  }
}

export type InputSqlResult =
  | { ok: true; statements: string[]; sql: string }
  | { ok: false; errors: string[] };

/**
 * `CREATE TABLE` + `INSERT` de cada planilha de entrada, para o script rodar sozinho.
 * Cada tabela ganha a coluna oculta `__flow_row` (ordem original das linhas).
 */
export function generateInputTablesSql(inputs: PreparedInputs, dialect: SqlDialect): InputSqlResult {
  if (inputs.errors.length > 0) return { ok: false, errors: inputs.errors };

  const statements: string[] = [];
  let total = 0;
  let count = 0;
  try {
    for (const table of inputs.tables) {
      const name = dialect.quoteIdent(table.sqlName);
      const columns = [...table.columns, { name: ROW_COLUMN, type: 'bigint' as ColumnType }];
      const columnList = columns.map(c => dialect.quoteIdent(c.name)).join(', ');
      const ddlColumns = columns.map(c => `${dialect.quoteIdent(c.name)} ${dialect.typeName(c.type)}`).join(', ');

      statements.push(
        `${commentLine(`Tabela de entrada: planilha "${table.sheetName}" (${table.rows.length} linhas)`)}\n` +
          `CREATE TABLE ${name} (${ddlColumns});`
      );

      for (let start = 0; start < table.rows.length; start += INSERT_BATCH_ROWS) {
        const batch = table.rows.slice(start, start + INSERT_BATCH_ROWS);
        const values = batch.map((row, i) => {
          const cells = table.columns.map(c => cellLiteral(dialect, c.type, row[c.name]));
          cells.push(String(start + i + 1));
          return `(${cells.join(', ')})`;
        });
        statements.push(`INSERT INTO ${name} (${columnList}) VALUES\n${values.join(',\n')};`);
      }
      total += statements.slice(count).reduce((sum, s) => sum + s.length, 0);
      count = statements.length;
      if (total > MAX_SCRIPT_CHARS) {
        return { ok: false, errors: [`Dados de entrada grandes demais para um script SQL (limite de ${MAX_SCRIPT_CHARS} caracteres)`] };
      }
    }
  } catch (error) {
    if (error instanceof SqlSafetyError) return { ok: false, errors: [error.message] };
    throw error;
  }
  return { ok: true, statements, sql: statements.join('\n\n') };
}
