// src/features/charts/formulaRules.ts
// Formatação condicional por fórmula ("usar uma fórmula para determinar quais células formatar").
// A fórmula é escrita para a célula âncora da regra e deslocada para cada célula do intervalo, como no Excel.

import { CellPosition, ConditionalFormatRule, Sheet } from '../../types/spreadsheet';
import { cellPosToKey } from '../../engine/formulaParser';
import { shiftFormula } from '../../engine/formulas/addressing';
import { evaluateFormula } from '../../engine/formulas/evaluator';
import { createSession, withSession } from '../../engine/formulas/session';

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

/**
 * Resultado já calculado por célula, válido enquanto as células e as regras forem as mesmas (rolar a grade
 * reaproveita; editar invalida). Sem isso, cada passo de rolagem reavaliava todas as regras das linhas visíveis.
 */
const cellResults = new WeakMap<object, { rules: readonly ConditionalFormatRule[]; byKey: Map<string, ConditionalFormatRule | null> }>();

/**
 * Para as linhas visíveis: a primeira regra por fórmula que se aplica a cada célula (chave "R{linha}C{coluna}").
 * `cols` limita às colunas desenhadas (planilhas largas); sem ele vale o intervalo inteiro de cada regra.
 */
export function formulaRuleMatches(
  sheet: Sheet,
  rowIndices: readonly number[],
  cols?: { start: number; end: number }
): Map<string, ConditionalFormatRule> {
  const matches = new Map<string, ConditionalFormatRule>();
  const rules = sheet.conditionalRules.filter(r => r.type === 'custom_formula' && r.formula);
  if (rules.length === 0) return matches;

  let cache = cellResults.get(sheet.data);
  if (!cache || cache.rules !== sheet.conditionalRules) {
    cache = { rules: sheet.conditionalRules, byKey: new Map() };
    cellResults.set(sheet.data, cache);
  }
  const byKey = cache.byKey;

  // Uma sessão de avaliação reaproveita os intervalos e os índices (CONT.SE sobre a coluna inteira, por exemplo)
  // entre as células; os valores da aba já estão calculados.
  const session = createSession({ isFresh: () => true, isPending: () => false });
  withSession(session, () => {
    for (const row of rowIndices) {
      const lastCol = Math.min(sheet.colCount - 1, cols?.end ?? sheet.colCount - 1);
      const firstCol = cols?.start ?? 0;
      for (let col = firstCol; col <= lastCol; col++) {
        const key = cellPosToKey(row, col);
        let hit = byKey.get(key);
        if (hit === undefined) {
          hit = null;
          for (const rule of rules) {
            if (formulaRuleApplies(sheet, rule, row, col)) {
              hit = rule;
              break;
            }
          }
          byKey.set(key, hit);
        }
        if (hit) matches.set(key, hit);
      }
    }
  });
  return matches;
}
