// src/features/relations/sql/ops/expr.ts
// Blocos de expressão SQL que reproduzem a semântica do motor em JS (evaluate.ts / pipelineEngine.ts).
// Todas recebem uma referência de coluna JÁ citada (`s."Coluna"`); nenhum valor do usuário entra cru.

import { ColumnInfo, ColumnType, SqlDialect } from '../types';

export interface CteDef {
  name: string;
  comment: string;
  body: string;
}

export interface CompiledNode {
  /** CTEs criadas por este nó, em ordem de dependência. */
  ctes: CteDef[];
  /** Nome (sem aspas) da CTE que representa o resultado do nó. */
  resultCte: string;
  columns: ColumnInfo[];
}

export interface OpContext {
  dialect: SqlDialect;
  /** Nome base das CTEs deste nó (sem aspas). */
  cteBase: string;
}

export class CompileNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileNodeError';
  }
}

export function findColumn(columns: readonly ColumnInfo[], name: string): ColumnInfo | undefined {
  return columns.find(c => c.name === name);
}

/** Equivalente a `String(valor)` do JS; NULL continua NULL. */
export function textOf(d: SqlDialect, expr: string, type: ColumnType): string {
  switch (type) {
    case 'varchar':
      return expr;
    case 'bigint':
      return d.castText(expr);
    case 'double':
      return d.doubleToText(expr);
    case 'boolean':
      return `CASE WHEN ${expr} IS NULL THEN NULL WHEN ${expr} THEN 'true' ELSE 'false' END`;
  }
}

/** Equivalente a `parseNumberSafely(valor, true)` (aproximado para texto: ver docs/FASE2_INTEGRACAO.md). */
export function numberOf(d: SqlDialect, expr: string, type: ColumnType): string {
  switch (type) {
    case 'varchar':
      return d.parseNumber(expr);
    case 'bigint':
    case 'double':
      return d.castDouble(expr);
    case 'boolean':
      return `CAST(NULL AS ${d.typeName('double')})`;
  }
}

/** Chave de busca normalizada: `String(v).trim().toLowerCase()`, ou NULL se vazia. */
export function keyOf(d: SqlDialect, expr: string, type: ColumnType): string {
  return d.lowerText(d.trimText(`NULLIF(${textOf(d, expr, type)}, '')`));
}

/** Texto de comparação do filtro: `String(v ?? '').trim().toLowerCase()`. */
export function comparableText(d: SqlDialect, expr: string, type: ColumnType): string {
  return d.lowerText(d.trimText(`COALESCE(${textOf(d, expr, type)}, '')`));
}

export function qualified(d: SqlDialect, alias: string, column: string): string {
  return `${alias}.${d.quoteIdent(column)}`;
}

/** Evita nomes repetidos nas colunas de saída (mesma regra do `uniqueName` do motor). */
export function uniqueColumnName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}
