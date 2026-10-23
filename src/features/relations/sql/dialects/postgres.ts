// src/features/relations/sql/dialects/postgres.ts
// Dialeto PostgreSQL. Diferenças: TEXT/DOUBLE PRECISION, BTRIM, operador `~`, ROUND só em NUMERIC
// e literais com barra invertida emitidos em sintaxe E'...' (independe de standard_conforming_strings).

import { ColumnType, SqlDialect, SqlSafetyError } from '../types';
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
  varchar: 'TEXT',
  bigint: 'BIGINT',
  double: 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
};

/** Limite do PostgreSQL (NAMEDATALEN - 1). */
const MAX_IDENTIFIER_BYTES = 63;

function stringLiteral(value: string): string {
  if (!value.includes('\\')) return standardStringLiteral(value);
  if (value.includes('\u0000')) throw new SqlSafetyError('Texto com caractere NUL não pode virar literal SQL');
  return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

export const postgresDialect: SqlDialect = {
  id: 'postgres',
  label: 'PostgreSQL',
  maxIdentifierBytes: MAX_IDENTIFIER_BYTES,

  quoteIdent: name => quoteIdentifier(name, MAX_IDENTIFIER_BYTES),
  stringLiteral,
  numberLiteral,
  booleanLiteral: value => (value ? 'TRUE' : 'FALSE'),
  typeName: type => TYPE_NAMES[type],

  likeContains: (textExpr, needle) =>
    `${textExpr} LIKE ${stringLiteral(`%${escapeLikeText(needle)}%`)} ESCAPE '${LIKE_ESCAPE}'`,
  castText: expr => `CAST(${expr} AS TEXT)`,
  castDouble: expr => `CAST(${expr} AS DOUBLE PRECISION)`,
  doubleToText: expr =>
    `CASE WHEN ${expr} = FLOOR(${expr}) AND ABS(${expr}) < 1e15 ` +
    `THEN CAST(CAST(${expr} AS BIGINT) AS TEXT) ELSE CAST(${expr} AS TEXT) END`,
  trimText: expr => `BTRIM(${expr}, ${TRIM_CHARS_SQL})`,
  lowerText: expr => `LOWER(${expr})`,
  parseNumber: textExpr =>
    `CASE WHEN ${textExpr} ~ ${stringLiteral(NUMBER_PLAIN)} THEN CAST(${textExpr} AS DOUBLE PRECISION) ` +
    `WHEN ${textExpr} ~ ${stringLiteral(NUMBER_COMMA)} THEN CAST(REPLACE(${textExpr}, ',', '.') AS DOUBLE PRECISION) ` +
    `WHEN ${textExpr} ~ ${stringLiteral(NUMBER_BR_THOUSANDS)} ` +
    `THEN CAST(REPLACE(REPLACE(${textExpr}, '.', ''), ',', '.') AS DOUBLE PRECISION) END`,
  round2: expr => `CAST(ROUND(CAST(${expr} AS NUMERIC), 2) AS DOUBLE PRECISION)`,
  createTableAs: (tableName, query) => `CREATE TABLE ${tableName} AS\n${query};`,
};
