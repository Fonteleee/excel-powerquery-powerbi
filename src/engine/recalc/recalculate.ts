// src/engine/recalc/recalculate.ts
// Ponto de entrada do recálculo de uma aba.

import { Sheet } from '../../types/spreadsheet';
import { recalculateSheetLegacy } from './legacyRecalc';

export function recalculateSheet(sheet: Sheet, allSheets: Sheet[] = [sheet]): Sheet {
  return recalculateSheetLegacy(sheet, allSheets);
}
