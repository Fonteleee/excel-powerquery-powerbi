// src/features/relations/sql/index.ts
// Ponto de entrada do módulo SQL: grafo + planilhas -> script.

import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph } from '../model/graph';
import { compileFlowToSql, CompileOptions, SqlExportResult } from './compile';
import { prepareInputs } from './inputs';

export { compileFlowToSql } from './compile';
export type { CompileOptions, CompiledQuery, OutputMode, SqlExportResult } from './compile';
export { generateInputTablesSql, prepareInputs } from './inputs';
export type { InputTable, PreparedInputs } from './inputs';
export { getDialect, SQL_DIALECTS } from './dialects';
export type { SqlDialect, SqlDialectId } from './types';

/** Atalho: lê as planilhas do grafo e gera o script completo. */
export function exportFlowAsSql(
  graph: FlowGraph,
  sheets: readonly Sheet[],
  options: CompileOptions = {}
): SqlExportResult {
  return compileFlowToSql(graph, prepareInputs(graph, sheets), options);
}
