// src/features/relations/sql/dialects/duckdb.ts
// Dialeto DuckDB (alvo principal; também é o motor que valida o SQL no navegador).

import { ColumnType, SqlDialect } from '../types';
import {
  escapeLikeText,
  LIKE_ESCAPE,
  NUMBER_BR_THOUSANDS,
  NUMBER_COMMA,
  NUMBER_PLAIN,
  numberLiteral,
  quoteIdentifier,
  standardStringLiteral,
  TRIM_CHARS_SQL,
} from './common';

const TYPE_NAMES: Record<ColumnType, string> = {
  varchar: 'VARCHAR',
  bigint: 'BIGINT',
  double: 'DOUBLE',
  boolean: 'BOOLEAN',
};

const MAX_IDENTIFIER_BYTES = 1024;

export const duckdbDialect: SqlDialect = {
  id: 'duckdb',
  label: 'DuckDB',
  maxIdentifierBytes: MAX_IDENTIFIER_BYTES,

  quoteIdent: name => quoteIdentifier(name, MAX_IDENTIFIER_BYTES),
  // DuckDB não interpreta barra invertida em literais comuns.
  stringLiteral: standardStringLiteral,
  numberLiteral,
  booleanLiteral: value => (value ? 'TRUE' : 'FALSE'),
  typeName: type => TYPE_NAMES[type],

  likeContains: (textExpr, needle) =>
    `${textExpr} LIKE ${standardStringLiteral(`%${escapeLikeText(needle)}%`)} ESCAPE '${LIKE_ESCAPE}'`,
  castText: expr => `CAST(${expr} AS VARCHAR)`,
  castDouble: expr => `CAST(${expr} AS DOUBLE)`,
  doubleToText: expr =>
    `CASE WHEN ${expr} = FLOOR(${expr}) AND ABS(${expr}) < 1e15 ` +
    `THEN CAST(CAST(${expr} AS BIGINT) AS VARCHAR) ELSE CAST(${expr} AS VARCHAR) END`,
  trimText: expr => `TRIM(${expr}, ${TRIM_CHARS_SQL})`,
  lowerText: expr => `LOWER(${expr})`,
  parseNumber: textExpr =>
    `CASE WHEN regexp_matches(${textExpr}, ${standardStringLiteral(NUMBER_PLAIN)}) THEN CAST(${textExpr} AS DOUBLE) ` +
    `WHEN regexp_matches(${textExpr}, ${standardStringLiteral(NUMBER_COMMA)}) THEN CAST(REPLACE(${textExpr}, ',', '.') AS DOUBLE) ` +
    `WHEN regexp_matches(${textExpr}, ${standardStringLiteral(NUMBER_BR_THOUSANDS)}) ` +
    `THEN CAST(REPLACE(REPLACE(${textExpr}, '.', ''), ',', '.') AS DOUBLE) END`,
  round2: expr => `ROUND(${expr}, 2)`,
  createTableAs: (tableName, query) => `CREATE TABLE ${tableName} AS\n${query};`,
};
