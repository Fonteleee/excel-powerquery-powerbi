// src/utils/importedResults.ts
import type { CellData, Sheet } from '../types/spreadsheet';

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';
const isErrorValue = (v: unknown): boolean => typeof v === 'string' && v.startsWith('#');

/**
 * Fórmula importada do Excel que o motor não soube calcular (erro) ou calculou como vazio, quando o Excel
 * tinha um resultado: continua mostrando o resultado do arquivo. Vale a cada recálculo, não só na importação.
 */
export function restoreExcelResult(data: { [key: string]: CellData }, key: string, excelValue: CellData['excelValue'] = data[key]?.excelValue): void {
  const cell = data[key];
  if (!cell || excelValue === undefined) return;
  // O resultado do arquivo acompanha a célula nos próximos recálculos.
  if (cell.excelValue !== excelValue) data[key] = { ...cell, excelValue };
  if (isBlank(excelValue)) return;
  const now = data[key];
  if (!now.error && !isErrorValue(now.value) && !isBlank(now.value)) return;
  data[key] = { ...now, value: excelValue, error: null, errorDetail: undefined };
  restoreObserver?.(data, key);
}

type RestoreObserver = (data: { [key: string]: CellData }, key: string) => void;
let restoreObserver: RestoreObserver | null = null;

/**
 * Observa as fórmulas em que o resultado do arquivo substituiu o do motor (relatório de fidelidade da importação).
 * Passe null para parar. Só um observador por vez (cada worker/thread tem o seu módulo).
 */
export function observeRestoredResults(observer: RestoreObserver | null): void {
  restoreObserver = observer;
}

/** Depois do recálculo, fórmula que o motor não entendeu volta a mostrar o resultado guardado no Excel. */
export function keepExcelResults(sheet: Sheet): Sheet {
  let data: Sheet['data'] | null = null;
  for (const key in sheet.data) {
    const cell = sheet.data[key];
    if (cell.excelValue === undefined) continue;
    data ??= { ...sheet.data };
    restoreExcelResult(data, key);
  }
  return data ? { ...sheet, data } : sheet;
}
