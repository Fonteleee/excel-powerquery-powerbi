// src/utils/importedResults.ts
import type { Sheet } from '../types/spreadsheet';

/** Depois do recálculo, fórmula que o motor não entendeu volta a mostrar o resultado guardado no Excel. */
export function keepExcelResults(sheet: Sheet): Sheet {
  let data: Sheet['data'] | null = null;
  for (const key in sheet.data) {
    const cell = sheet.data[key];
    if (cell.excelValue === undefined || (!cell.error && !(typeof cell.value === 'string' && cell.value.startsWith('#')))) continue;
    data ??= { ...sheet.data };
    data[key] = { ...cell, value: cell.excelValue, error: null, errorDetail: undefined };
  }
  return data ? { ...sheet, data } : sheet;
}
