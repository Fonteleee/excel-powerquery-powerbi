// src/features/relations/sql/dialects/index.ts
// Registro dos dialetos disponíveis.

import { SqlDialect, SqlDialectId } from '../types';
import { duckdbDialect } from './duckdb';
import { postgresDialect } from './postgres';

export { duckdbDialect, postgresDialect };

export const SQL_DIALECTS: readonly SqlDialect[] = [duckdbDialect, postgresDialect];

export function getDialect(id: SqlDialectId): SqlDialect {
  return id === 'postgres' ? postgresDialect : duckdbDialect;
}

export function isDialectId(value: unknown): value is SqlDialectId {
  return value === 'duckdb' || value === 'postgres';
}
