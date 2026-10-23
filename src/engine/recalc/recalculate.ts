// src/engine/recalc/recalculate.ts
// Ponto de entrada do recálculo. Dois motores coexistem atrás de uma flag:
//   'graph'  (padrão)  grafo de dependências, ordem topológica, cache por rodada, #CIRCULAR! claro
//   'legacy'           varredura de até 3 passagens (comportamento anterior, para rollback/comparação)

import { Sheet } from '../../types/spreadsheet';
import { CellChange, RecalcEngine, RecalcResult } from './engine';
import { recalculateSheetLegacy } from './legacyRecalc';

export type RecalcEngineKind = 'graph' | 'legacy';

export interface RecalcOptions {
  /** Força o motor nesta chamada (padrão: o definido por `setRecalcEngine`). */
  engine?: RecalcEngineKind;
}

let defaultEngine: RecalcEngineKind = 'graph';

/** Define o motor usado quando a chamada não escolhe um. */
export function setRecalcEngine(kind: RecalcEngineKind): void {
  defaultEngine = kind;
}

export function getRecalcEngine(): RecalcEngineKind {
  return defaultEngine;
}

/** Recalcula todas as fórmulas de uma aba (as outras abas só são lidas). Não altera a entrada. */
export function recalculateSheet(sheet: Sheet, allSheets: Sheet[] = [sheet], options: RecalcOptions = {}): Sheet {
  if ((options.engine ?? defaultEngine) === 'legacy') return recalculateSheetLegacy(sheet, allSheets);

  const workbook = allSheets.some(s => s.id === sheet.id)
    ? allSheets.map(s => (s.id === sheet.id ? sheet : s))
    : [...allSheets, sheet];
  const engine = new RecalcEngine(workbook, sheet.id);
  const result = engine.recalculateAll(workbook, sheet.id);
  return result.sheets.find(s => s.id === sheet.id) ?? sheet;
}

/**
 * Recalcula apenas o que depende das células alteradas (em qualquer aba do workbook).
 * `sheets` já deve conter as edições. Para várias edições seguidas, prefira manter um `RecalcEngine`.
 */
export function recalculateFrom(sheets: readonly Sheet[], changes: readonly CellChange[]): RecalcResult {
  return new RecalcEngine(sheets).apply(sheets, changes);
}

export { RecalcEngine };
export type { CellChange, RecalcResult };
