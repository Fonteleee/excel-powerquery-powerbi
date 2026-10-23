// src/features/relations/sql/ops/aggregate.ts
// SOMASE/MÉDIASE/CONT.SE -> GROUP BY com SUM/AVG/COUNT/MIN/MAX (mesma regra de arredondamento do motor).

import { AggregateParams, AggType } from '../../model/graph';
import { ColumnInfo, ROW_COLUMN } from '../types';
import { CompiledNode, CompileNodeError, findColumn, numberOf, OpContext, qualified } from './expr';

function aggregateExpr(ctx: OpContext, agg: AggType, column: ColumnInfo): string {
  const d = ctx.dialect;
  const ref = qualified(d, 's', column.name);

  if (agg === 'COUNT') {
    // Conta células preenchidas (nem nulas nem vazias), como o motor.
    return column.type === 'varchar'
      ? `COUNT(CASE WHEN ${ref} IS NOT NULL AND ${ref} <> '' THEN 1 END)`
      : `COUNT(${ref})`;
  }

  const num = numberOf(d, ref, column.type);
  switch (agg) {
    case 'SUM':
      return `COALESCE(${d.round2(`SUM(${num})`)}, 0)`;
    case 'AVG':
      return `COALESCE(${d.round2(`AVG(${num})`)}, 0)`;
    case 'MIN':
      return `COALESCE(MIN(${num}), 0)`;
    case 'MAX':
      return `COALESCE(MAX(${num}), 0)`;
  }
}

export function compileAggregate(params: AggregateParams, input: CompiledNode, ctx: OpContext): CompiledNode {
  const d = ctx.dialect;
  const groupColumns = params.groupBy.map(name => {
    const column = findColumn(input.columns, name);
    if (!column) throw new CompileNodeError(`Coluna "${name}" não encontrada`);
    return column;
  });
  const aggregations = params.aggregations.map(a => {
    const column = findColumn(input.columns, a.column);
    if (!column) throw new CompileNodeError(`Coluna "${a.column}" não encontrada`);
    return { agg: a.agg, column, outputName: a.outputName || `${a.agg}_${a.column}` };
  });

  if (groupColumns.length === 0 && aggregations.length === 0) {
    throw new CompileNodeError('Agregação sem colunas de agrupamento nem de valor');
  }
  const outputNames = [...groupColumns.map(c => c.name), ...aggregations.map(a => a.outputName)];
  const duplicated = outputNames.find((name, i) => outputNames.indexOf(name) !== i);
  if (duplicated !== undefined) throw new CompileNodeError(`Nome de saída repetido "${duplicated}" na agregação`);

  const selectList = [
    ...groupColumns.map(c => qualified(d, 's', c.name)),
    ...aggregations.map(a => `${aggregateExpr(ctx, a.agg, a.column)} AS ${d.quoteIdent(a.outputName)}`),
    `MIN(${qualified(d, 's', ROW_COLUMN)}) AS ${d.quoteIdent(ROW_COLUMN)}`,
  ];
  const lines = [`SELECT ${selectList.join(',\n       ')}`, `FROM ${d.quoteIdent(input.resultCte)} AS s`];
  if (groupColumns.length > 0) {
    lines.push(`GROUP BY ${groupColumns.map(c => qualified(d, 's', c.name)).join(', ')}`);
  } else {
    // Sem colunas de agrupamento o SQL devolveria uma linha mesmo para entrada vazia; o motor não.
    lines.push('HAVING COUNT(*) > 0');
  }

  return {
    ctes: [{ name: ctx.cteBase, comment: 'Agrupamento (SOMASE/MÉDIASE/CONT.SE)', body: lines.join('\n') }],
    resultCte: ctx.cteBase,
    columns: [
      ...groupColumns,
      ...aggregations.map(a => ({
        name: a.outputName,
        type: a.agg === 'COUNT' ? ('bigint' as const) : ('double' as const),
      })),
    ],
  };
}
