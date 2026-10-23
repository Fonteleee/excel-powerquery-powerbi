// src/features/relations/sql/types.ts
// Tipos compartilhados pelo compilador de grafo para SQL e pelos dialetos.

export type ColumnType = 'varchar' | 'bigint' | 'double' | 'boolean';

export interface ColumnInfo {
  name: string;
  type: ColumnType;
}

export type SqlDialectId = 'duckdb' | 'postgres';

/** Versão do formato do script gerado (aparece no cabeçalho do SQL). */
export const SQL_FORMAT_VERSION = 1;

/** Limite de tamanho do script completo (em caracteres). */
export const MAX_SCRIPT_CHARS = 8_000_000;

/** Coluna oculta que preserva a ordem original das linhas ("primeira ocorrência vence"). */
export const ROW_COLUMN = '__flow_row';

/** Lançado quando um nome ou valor não pode ser emitido com segurança em SQL. */
export class SqlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlSafetyError';
  }
}

/**
 * Tudo que muda entre bancos fica aqui. O compilador nunca concatena texto do usuário
 * sem passar por `quoteIdent`, `stringLiteral`, `numberLiteral` ou `likeContains`.
 */
export interface SqlDialect {
  readonly id: SqlDialectId;
  readonly label: string;
  /** Limite de bytes de um identificador (Postgres trunca silenciosamente acima de 63). */
  readonly maxIdentifierBytes: number;

  /** Identificador entre aspas duplas, com `"` escapado. Lança `SqlSafetyError` se for inseguro. */
  quoteIdent(name: string): string;
  /** Literal de texto com `'` escapado. */
  stringLiteral(value: string): string;
  numberLiteral(value: number): string;
  booleanLiteral(value: boolean): string;
  typeName(type: ColumnType): string;

  /** `expr` (texto já minúsculo e aparado) contém `needle`? Usa `LIKE ... ESCAPE`. */
  likeContains(textExpr: string, needle: string): string;
  castText(expr: string): string;
  castDouble(expr: string): string;
  /** Converte um DOUBLE em texto como o JS faz (2.0 vira "2"). */
  doubleToText(expr: string): string;
  /** Apara espaços, tabs, quebras de linha e NBSP. */
  trimText(expr: string): string;
  lowerText(expr: string): string;
  /** Texto para DOUBLE aceitando "1234.5", "1234,5" e "1.234,5"; NULL se não for número. */
  parseNumber(textExpr: string): string;
  /** Arredonda um DOUBLE para 2 casas e devolve DOUBLE. */
  round2(doubleExpr: string): string;
  createTableAs(tableName: string, query: string): string;
}
