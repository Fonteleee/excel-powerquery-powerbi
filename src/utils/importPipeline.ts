// src/utils/importPipeline.ts
// Pipeline PURO da importação de .xlsx: leitura -> conversão por aba -> recálculo -> relatório de fidelidade.
// Sem Worker/DOM: o worker (import.worker.ts) e o fallback síncrono (importClient.ts) chamam esta função.

import { Sheet, CellData } from '../types/spreadsheet';
import { formatCellValue } from '../engine/formulas/formatting';
import { recalculateSheet } from '../engine/recalc/recalculate';
import { keepExcelResults, observeRestoredResults } from './importedResults';
import { ImportCancelledError, summarizeReport } from './importProtocol';
import { baseFileName, readWorkbookBytes, workbookToSheets } from './workbookImport';

export type ImportStage = 'reading' | 'converting' | 'calculating' | 'done';

export interface ImportProgress {
  stage: ImportStage;
  /** Texto pronto para a barra de progresso. */
  message: string;
  /** 0 a 100. */
  percent: number;
  current?: number;
  total?: number;
}

export interface ImportHooks {
  onProgress?: (progress: ImportProgress) => void;
  /** Consultado entre as etapas e entre as abas; true cancela (lança ImportCancelledError). */
  shouldCancel?: () => boolean;
}

export { ImportCancelledError, summarizeReport };

/** Fidelidade de uma aba: o que o motor calculou comparado com o resultado que o Excel guardou no arquivo. */
export interface SheetFidelity {
  name: string;
  /** Fórmulas vivas importadas (células com `=` e resultado do arquivo). */
  formulas: number;
  /** O motor calculou o mesmo resultado que o Excel. */
  matched: number;
  /** O motor falhou/devolveu vazio e a célula usa o resultado do arquivo como reserva. */
  fallback: number;
  /** O motor calculou, mas o resultado difere do arquivo. */
  divergent: number;
  /** Não comparável (ex.: data/hora, que o arquivo guarda como texto formatado). */
  unverified: number;
}

export interface ImportReport {
  fileName: string;
  sheets: SheetFidelity[];
  totals: Omit<SheetFidelity, 'name'>;
  skipped: string[];
  notes: string[];
  /** Tempo de cada etapa, em ms. */
  timings: { readMs: number; convertMs: number; calcMs: number; totalMs: number };
}

export interface ImportOutcome {
  sheets: Sheet[];
  report: ImportReport;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';
const isErrorText = (v: unknown): boolean => typeof v === 'string' && v.startsWith('#');

/** O resultado do motor é o mesmo do Excel? Números com tolerância relativa; texto sem diferenciar espaços nas pontas. */
export function sameResult(engine: CellData['value'], excel: CellData['excelValue']): boolean {
  if (isBlank(engine) && isBlank(excel)) return true;
  if (typeof engine === 'number' && typeof excel === 'number') {
    return Math.abs(engine - excel) <= 1e-9 * Math.max(1, Math.abs(excel));
  }
  if (typeof engine === 'boolean' || typeof excel === 'boolean') return engine === excel;
  if (typeof engine === 'number' && typeof excel === 'string' && excel.trim() !== '' && Number.isFinite(Number(excel))) {
    return Math.abs(engine - Number(excel)) <= 1e-9 * Math.max(1, Math.abs(Number(excel)));
  }
  return String(engine ?? '').trim() === String(excel ?? '').trim();
}

/** Conta, numa aba já calculada, quantas fórmulas bateram, usam a reserva do arquivo, divergem ou não são comparáveis. */
export function sheetFidelity(sheet: Sheet, restoredKeys: ReadonlySet<string>): SheetFidelity {
  const out: SheetFidelity = { name: sheet.name, formulas: 0, matched: 0, fallback: 0, divergent: 0, unverified: 0 };
  for (const key in sheet.data) {
    const cell = sheet.data[key];
    if (cell.excelValue === undefined || typeof cell.raw !== 'string' || !cell.raw.startsWith('=')) continue;
    out.formulas++;
    if (restoredKeys.has(key)) {
      // Erro no motor e erro no arquivo (ex.: #N/D nos dois) é concordância, não reserva.
      if (isErrorText(cell.excelValue)) out.matched++;
      else out.fallback++;
      continue;
    }
    const type = cell.format?.type;
    const isTime = type === 'date' || type === 'time_hh_mm' || type === 'time_hh_mm_ss';
    if (isTime && typeof cell.value === 'number' && typeof cell.excelValue === 'string') {
      // O arquivo guarda data/hora como texto formatado: compara com o número de série formatado do mesmo jeito.
      if (formatCellValue(cell.value, cell.format) === cell.excelValue) out.matched++;
      else out.unverified++;
    } else if (sameResult(cell.value, cell.excelValue)) out.matched++;
    else out.divergent++;
  }
  return out;
}

function sumTotals(list: SheetFidelity[]): ImportReport['totals'] {
  const t = { formulas: 0, matched: 0, fallback: 0, divergent: 0, unverified: 0 };
  for (const s of list) {
    t.formulas += s.formulas;
    t.matched += s.matched;
    t.fallback += s.fallback;
    t.divergent += s.divergent;
    t.unverified += s.unverified;
  }
  return t;
}

const formulaCount = (sheet: Sheet): number => {
  let n = 0;
  for (const key in sheet.data) if (sheet.data[key].excelValue !== undefined) n++;
  return n;
};

// Pesos de cada etapa na barra (a leitura é a maior parte do trabalho; o cálculo é dividido por fórmulas).
const READ_END = 38;
const CONVERT_END = 50;

/**
 * Importa o arquivo inteiro: lê, converte cada aba e recalcula (cada aba é recalculada vendo as outras como
 * estão no arquivo, igual ao comportamento anterior). Devolve as abas JÁ calculadas e o relatório de fidelidade.
 */
export function runImportPipeline(bytes: Uint8Array, fileName: string, hooks: ImportHooks = {}): ImportOutcome {
  const { onProgress, shouldCancel } = hooks;
  const check = (): void => {
    if (shouldCancel?.()) throw new ImportCancelledError();
  };
  const report = (p: ImportProgress): void => onProgress?.(p);
  const t0 = now();

  check();
  report({ stage: 'reading', message: 'Lendo o arquivo…', percent: 1 });
  const workbook = readWorkbookBytes(bytes);
  const tRead = now();
  check();

  const converted = workbookToSheets(workbook, baseFileName(fileName), {
    shouldCancel,
    cancelError: () => new ImportCancelledError(),
    onSheet: (done, total, name) =>
      report({
        stage: 'converting',
        message: `Convertendo aba ${done + 1} de ${total}: ${name}`,
        percent: READ_END + ((CONVERT_END - READ_END) * done) / Math.max(1, total),
        current: done + 1,
        total,
      }),
  });
  const tConvert = now();

  const all = converted.sheets;
  const weights = all.map(formulaCount);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const fidelity: SheetFidelity[] = [];
  const calculated: Sheet[] = [];
  let doneWeight = 0;
  try {
    for (let i = 0; i < all.length; i++) {
      check();
      report({
        stage: 'calculating',
        message: `Calculando fórmulas da aba ${i + 1} de ${all.length}: ${all[i].name}`,
        percent: CONVERT_END + ((100 - CONVERT_END) * doneWeight) / totalWeight,
        current: i + 1,
        total: all.length,
      });
      const restored = new Set<string>();
      if (weights[i] > 0) {
        observeRestoredResults((_data, key) => restored.add(key));
        calculated.push(keepExcelResults(recalculateSheet(all[i], all)));
        observeRestoredResults(null);
      } else {
        calculated.push(all[i]);
      }
      fidelity.push(sheetFidelity(calculated[i], restored));
      doneWeight += weights[i];
    }
  } finally {
    observeRestoredResults(null);
  }
  const tCalc = now();

  report({ stage: 'done', message: 'Importação concluída.', percent: 100 });
  return {
    sheets: calculated,
    report: {
      fileName,
      sheets: fidelity,
      totals: sumTotals(fidelity),
      skipped: converted.skipped,
      notes: converted.notes,
      timings: { readMs: tRead - t0, convertMs: tConvert - tRead, calcMs: tCalc - tConvert, totalMs: tCalc - t0 },
    },
  };
}
