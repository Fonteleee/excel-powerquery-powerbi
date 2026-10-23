// src/features/relations/sql/ops/filter.ts
// FILTRO -> WHERE. O valor da condição é sempre literal escapado; `contains` usa LIKE com ESCAPE.

import { parseNumberSafely } from '../../../../engine/formulaParser';
import { FilterOperator, FilterParams } from '../../model/graph';
import { ROW_COLUMN } from '../types';
import {
  comparableText,
  CompiledNode,
  CompileNodeError,
  findColumn,
  numberOf,
  OpContext,
  qualified,
} from './expr';

/** Tokens fixos: o operador nunca vem do usuário para dentro do SQL. */
const ORDER_OPERATORS = { '>': '>', '<': '<', '>=': '>=', '<=': '<=' } as const;

export function compileFilter(params: FilterParams, input: CompiledNode, ctx: OpContext): CompiledNode {
  const d = ctx.dialect;

  const predicates = params.conditions.map(condition => {
    const column = findColumn(input.columns, condition.column);
    if (!column) throw new CompileNodeError(`Coluna "${condition.column}" não encontrada`);

    const ref = qualified(d, 's', column.name);
    const target = String(condition.value).trim().toLowerCase();
    const targetNumber = parseNumberSafely(condition.value, true);
    const rowText = comparableText(d, ref, column.type);
    const sameText = `${rowText} = ${d.stringLiteral(target)}`;
    const operator: FilterOperator = condition.operator;

    switch (operator) {
      case '=':
        return targetNumber !== null
          ? `COALESCE(${numberOf(d, ref, column.type)} = ${d.numberLiteral(targetNumber)}, ${sameText})`
          : sameText;
      case '<>':
        return targetNumber !== null
          ? `NOT COALESCE(${numberOf(d, ref, column.type)} = ${d.numberLiteral(targetNumber)}, ${sameText})`
          : `${rowText} <> ${d.stringLiteral(target)}`;
      case '>':
      case '<':
      case '>=':
      case '<=':
        // Comparações de ordem só valem entre números; qualquer outra coisa reprova a linha.
        return targetNumber === null
          ? d.booleanLiteral(false)
          : `COALESCE(${numberOf(d, ref, column.type)} ${ORDER_OPERATORS[operator]} ${d.numberLiteral(targetNumber)}, ${d.booleanLiteral(false)})`;
      case 'contains':
        return d.likeContains(rowText, target);
      default:
        throw new CompileNodeError('Operador de filtro desconhecido');
    }
  });

  const selectList = [...input.columns.map(c => qualified(d, 's', c.name)), qualified(d, 's', ROW_COLUMN)];
  const where = predicates.length > 0 ? predicates.map(p => `(${p})`).join('\n  AND ') : d.booleanLiteral(true);
  const body = [
    `SELECT ${selectList.join(', ')}`,
    `FROM ${d.quoteIdent(input.resultCte)} AS s`,
    `WHERE ${where}`,
  ].join('\n');

  return {
    ctes: [{ name: ctx.cteBase, comment: 'Filtro (FILTRO)', body }],
    resultCte: ctx.cteBase,
    columns: input.columns,
  };
}
