// src/features/charts/formulaRules.ts
// Formatação condicional por fórmula ("usar uma fórmula para determinar quais células formatar").
// A fórmula é escrita para a célula âncora da regra e deslocada para cada célula do intervalo, como no Excel.

import { CellPosition, ConditionalFormatRule, Sheet } from '../../types/spreadsheet';
import { cellPosToKey } from '../../engine/formulaParser';
import { shiftFormula } from '../../engine/formulas/addressing';
import { evaluateFormula } from '../../engine/formulas/evaluator';

/** LIN() e COL() sem argumento valem a linha e a coluna da própria célula. */
function bindOwnCell(formula: string, pos: CellPosition): string {
  return formula
    .replace(/\b(?:ROW|LIN)\(\s*\)/gi, String(pos.row + 1))
    .replace(/\b(?:COLUMN|COL|COLUNA)\(\s*\)/gi, String(pos.col + 1));
}

function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toUpperCase() === 'VERDADEIRO' || value.toUpperCase() === 'TRUE';
  return false;
}

export function formulaRuleApplies(sheet: Sheet, rule: ConditionalFormatRule, row: number, col: number): boolean {
  if (rule.type !== 'custom_formula' || !rule.formula) return false;
  const { startRow, startCol, endRow, endCol } = rule.range;
  if (row < startRow || row > endRow || col < startCol || col > endCol) return false;
  const anchor = rule.anchor ?? { row: startRow, col: startCol };
  const text = bindOwnCell(shiftFormula(rule.formula, row - anchor.row, col - anchor.col), { row, col });
  try {
    return truthy(evaluateFormula(text, sheet));
  } catch {
    return false;
  }
}

/** Para as linhas visíveis: a primeira regra por fórmula que se aplica a cada célula (chave "R{linha}C{coluna}"). */
export function formulaRuleMatches(sheet: Sheet, rowIndices: readonly number[]): Map<string, ConditionalFormatRule> {
  const matches = new Map<string, ConditionalFormatRule>();
  const rules = sheet.conditionalRules.filter(r => r.type === 'custom_formula' && r.formula);
  if (rules.length === 0) return matches;
  for (const rule of rules) {
    for (const row of rowIndices) {
      if (row < rule.range.startRow || row > rule.range.endRow) continue;
      for (let col = rule.range.startCol; col <= Math.min(rule.range.endCol, sheet.colCount - 1); col++) {
        const key = cellPosToKey(row, col);
        if (!matches.has(key) && formulaRuleApplies(sheet, rule, row, col)) matches.set(key, rule);
      }
    }
  }
  return matches;
}
