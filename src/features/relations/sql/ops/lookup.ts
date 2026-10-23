// src/features/relations/sql/ops/lookup.ts
// PROCX/PROCV -> LEFT JOIN sobre uma CTE que guarda só a primeira linha por chave normalizada.

import { LookupParams } from '../../model/graph';
import { ColumnInfo, ColumnType, ROW_COLUMN } from '../types';
import {
  CompiledNode,
  CompileNodeError,
  CteDef,
  findColumn,
  keyOf,
  OpContext,
  qualified,
  textOf,
  uniqueColumnName,
} from './expr';

const KEY = '__flow_key';
const RANK = '__flow_rank';
const NUMERIC_TEXT = /^[-+]?\d+(\.\d+)?$/;

interface ReturnPlan {
  /** Expressão SQL do valor devolvido (sem o alias de saída). */
  expr: string;
  type: ColumnType;
}

function returnValue(
  ctx: OpContext,
  params: LookupParams,
  type: ColumnType,
  valueRef: string,
  keyRef: string
): ReturnPlan {
  const d = ctx.dialect;
  const fallback = params.ifNotFound;

  // Sem valor de "não encontrado": a ausência vira NULL e o tipo original é mantido.
  if (fallback === '') return { expr: valueRef, type };

  const numericFallback = NUMERIC_TEXT.test(fallback) ? Number(fallback) : NaN;
  if ((type === 'bigint' || type === 'double') && Number.isFinite(numericFallback)) {
    const asInteger = type === 'bigint' && Number.isSafeInteger(numericFallback) && !fallback.includes('.');
    const resultType: ColumnType = asInteger ? 'bigint' : 'double';
    return {
      expr: `CAST(CASE WHEN ${keyRef} IS NULL THEN ${d.numberLiteral(numericFallback)} ELSE ${valueRef} END AS ${d.typeName(resultType)})`,
      type: resultType,
    };
  }

  return {
    expr: `CASE WHEN ${keyRef} IS NULL THEN ${d.stringLiteral(fallback)} ELSE ${textOf(d, valueRef, type)} END`,
    type: 'varchar',
  };
}

export function compileLookup(
  params: LookupParams,
  source: CompiledNode,
  lookup: CompiledNode,
  ctx: OpContext
): CompiledNode {
  const d = ctx.dialect;
  const sourceKey = findColumn(source.columns, params.sourceKey);
  if (!sourceKey) throw new CompileNodeError(`Coluna "${params.sourceKey}" não encontrada na tabela de origem`);
  const lookupKey = findColumn(lookup.columns, params.lookupKey);
  if (!lookupKey) throw new CompileNodeError(`Coluna "${params.lookupKey}" não encontrada na tabela de busca`);
  const returned: ColumnInfo[] = params.returns.map(name => {
    const column = findColumn(lookup.columns, name);
    if (!column) throw new CompileNodeError(`Coluna "${name}" não encontrada na tabela de busca`);
    return column;
  });

  const searchName = `${ctx.cteBase}_busca`;
  const innerKey = keyOf(d, qualified(d, 'r', lookupKey.name), lookupKey.type);
  const valueAlias = (i: number) => `__flow_v${i}`;

  const searchBody = [
    `SELECT ${[KEY, ...returned.map((_, i) => valueAlias(i))].map(n => `x.${d.quoteIdent(n)}`).join(', ')}`,
    `FROM (`,
    `  SELECT ${innerKey} AS ${d.quoteIdent(KEY)},`,
    ...returned.map((c, i) => `         ${qualified(d, 'r', c.name)} AS ${d.quoteIdent(valueAlias(i))},`),
    `         ROW_NUMBER() OVER (PARTITION BY ${innerKey} ORDER BY ${qualified(d, 'r', ROW_COLUMN)}) AS ${d.quoteIdent(RANK)}`,
    `  FROM ${d.quoteIdent(lookup.resultCte)} AS r`,
    `  WHERE ${innerKey} IS NOT NULL`,
    `) AS x`,
    `WHERE x.${d.quoteIdent(RANK)} = 1`,
  ].join('\n');

  const used = new Set(source.columns.map(c => c.name));
  const outputs = returned.map((column, i) => {
    const wanted = params.prefix ? `${params.prefix} - ${column.name}` : column.name;
    const name = uniqueColumnName(wanted, used);
    used.add(name);
    const plan = returnValue(
      ctx,
      params,
      column.type,
      qualified(d, 'b', valueAlias(i)),
      qualified(d, 'b', KEY)
    );
    return { name, plan };
  });

  const sourceKeyExpr = keyOf(d, qualified(d, 's', sourceKey.name), sourceKey.type);
  const selectList = [
    ...source.columns.map(c => qualified(d, 's', c.name)),
    ...outputs.map(o => `${o.plan.expr} AS ${d.quoteIdent(o.name)}`),
    qualified(d, 's', ROW_COLUMN),
  ];
  const mainBody = [
    `SELECT ${selectList.join(',\n       ')}`,
    `FROM ${d.quoteIdent(source.resultCte)} AS s`,
    `LEFT JOIN ${d.quoteIdent(searchName)} AS b ON ${sourceKeyExpr} = b.${d.quoteIdent(KEY)}`,
  ].join('\n');

  const ctes: CteDef[] = [
    {
      name: searchName,
      comment: 'Tabela de busca: só a primeira linha de cada chave (como PROCX/PROCV)',
      body: searchBody,
    },
    { name: ctx.cteBase, comment: 'LEFT JOIN com a tabela de busca', body: mainBody },
  ];
  return {
    ctes,
    resultCte: ctx.cteBase,
    columns: [...source.columns, ...outputs.map(o => ({ name: o.name, type: o.plan.type }))],
  };
}
