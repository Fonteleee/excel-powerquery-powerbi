// src/features/relations/analysis/health.ts
// Data Health HUD: resumo de integridade por tabela + correções propostas (declarativas).
// Puro: nunca altera a planilha; quem aplica correções é `applyHealthFix` (healthFix.ts).

import { Sheet } from '../../../types/spreadsheet';
import { DATE_FORMATS, DateFormat, parseDateText } from './dates';
import {
  CellKind,
  ColumnHealth,
  ProposedFix,
  TableHealth,
} from './healthTypes';
import {
  cellValue,
  classifyValue,
  dataRowIndexes,
  hasExtraSpaces,
  isFormulaCell,
  isForbiddenHeader,
  listColumns,
  RawValue,
  SheetColumn,
} from './sheetAccess';

export { applyHealthFix, previewHealthFix } from './healthFix';
export type { CellKind, ColumnHealth, FixPreview, HealthFix, ProposedFix, TableHealth } from './healthTypes';

const KIND_ORDER: readonly CellKind[] = ['number', 'numericText', 'date', 'text', 'boolean'];
/** Teto de linhas analisadas (custo limitado em planilhas enormes). */
export const MAX_ANALYZED_ROWS = 200_000;

const emptyKinds = (): Record<CellKind, number> => ({ number: 0, numericText: 0, date: 0, text: 0, boolean: 0 });

/** Chave de uma linha para detectar duplicata exata. */
export function rowSignature(values: readonly RawValue[]): string {
  return JSON.stringify(values.map(v => (v === null || v === undefined ? '' : String(v))));
}

function dominantOf<T extends string>(counts: Partial<Record<T, number>>, order: readonly T[]): T | null {
  let best: T | null = null;
  let bestCount = 0;
  for (const key of order) {
    const count = counts[key] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

interface ColumnScan {
  column: SheetColumn;
  kinds: (CellKind | null)[];
  formats: (DateFormat | null)[];
  extraSpaces: boolean[];
  formula: boolean[];
}

function scanColumn(sheet: Sheet, column: SheetColumn, rows: readonly number[]): ColumnScan {
  const kinds: (CellKind | null)[] = [];
  const formats: (DateFormat | null)[] = [];
  const extraSpaces: boolean[] = [];
  const formula: boolean[] = [];
  for (const row of rows) {
    const value = cellValue(sheet, row, column.index);
    const kind = classifyValue(value);
    kinds.push(kind);
    formats.push(kind === 'date' ? (parseDateText(String(value))?.format ?? null) : null);
    extraSpaces.push(hasExtraSpaces(value));
    formula.push(isFormulaCell(sheet, row, column.index));
  }
  return { column, kinds, formats, extraSpaces, formula };
}

function summarize(scan: ColumnScan, rowCount: number): ColumnHealth {
  const kinds = emptyKinds();
  const dateFormats: Partial<Record<DateFormat, number>> = {};
  let whitespaceCells = 0;
  scan.kinds.forEach((kind, i) => {
    if (kind) kinds[kind]++;
    const format = scan.formats[i];
    if (format) dateFormats[format] = (dateFormats[format] ?? 0) + 1;
    if (scan.extraSpaces[i]) whitespaceCells++;
  });

  const filled = KIND_ORDER.reduce((sum, k) => sum + kinds[k], 0);
  const empty = rowCount - filled;
  const numeric = kinds.number + kinds.numericText;
  const groups = [numeric, kinds.date, kinds.text, kinds.boolean].filter(n => n > 0).length;
  const dominantDateFormat = dominantOf(dateFormats, DATE_FORMATS);

  return {
    index: scan.column.index,
    header: scan.column.header,
    filled,
    empty,
    emptyPercent: rowCount > 0 ? (empty / rowCount) * 100 : 0,
    whitespaceCells,
    kinds,
    dominantKind: dominantOf(kinds, KIND_ORDER),
    mixedTypes: groups >= 2 || (kinds.number > 0 && kinds.numericText > 0),
    dateFormats,
    dominantDateFormat,
    divergentDates: Object.keys(dateFormats).length >= 2,
  };
}

function proposeFixes(scans: ColumnScan[], columns: ColumnHealth[], duplicateRows: number): ProposedFix[] {
  const fixes: ProposedFix[] = [];

  const trimColumns = columns.filter(c => c.whitespaceCells > 0 && !isForbiddenHeader(c.header));
  if (trimColumns.length > 0) {
    const affected = trimColumns.reduce((sum, col) => {
      const scan = scans.find(s => s.column.index === col.index)!;
      return sum + scan.extraSpaces.filter((flag, i) => flag && !scan.formula[i]).length;
    }, 0);
    fixes.push({
      id: 'trim_spaces',
      fix: { kind: 'trim_spaces', columns: trimColumns.map(c => c.header) },
      title: 'Aparar espaços sobrando',
      description: `Remove espaços nas pontas e repetidos em ${trimColumns.map(c => `"${c.header}"`).join(', ')}.`,
      affectedCells: affected,
      affectedRows: affected,
    });
  }

  for (const col of columns) {
    if (isForbiddenHeader(col.header)) continue;
    const scan = scans.find(s => s.column.index === col.index)!;
    const editable = (kind: CellKind) =>
      scan.kinds.filter((k, i) => k === kind && !scan.formula[i]).length;

    if (col.mixedTypes) {
      const numeric = col.kinds.number + col.kinds.numericText;
      const others = Math.max(col.kinds.date, col.kinds.text, col.kinds.boolean);
      if (col.kinds.numericText > 0 && numeric >= others) {
        const affected = editable('numericText');
        if (affected > 0) {
          fixes.push({
            id: `standardize_type:number:${col.index}`,
            fix: { kind: 'standardize_type', column: col.header, to: 'number' },
            title: `Converter "${col.header}" para número`,
            description: `${col.kinds.numericText} valor(es) de "${col.header}" estão como texto mas são números.`,
            affectedCells: affected,
            affectedRows: affected,
          });
        }
      } else if (col.kinds.text > numeric && col.kinds.number > 0) {
        const affected = editable('number');
        if (affected > 0) {
          fixes.push({
            id: `standardize_type:text:${col.index}`,
            fix: { kind: 'standardize_type', column: col.header, to: 'text' },
            title: `Converter "${col.header}" para texto`,
            description: `"${col.header}" é majoritariamente texto, mas ${col.kinds.number} valor(es) são números.`,
            affectedCells: affected,
            affectedRows: affected,
          });
        }
      }
    }

    if (col.divergentDates && col.dominantDateFormat) {
      const target = col.dominantDateFormat;
      const affected = scan.formats.filter((f, i) => f !== null && f !== target && !scan.formula[i]).length;
      fixes.push({
        id: `normalize_dates:${col.index}`,
        fix: { kind: 'normalize_dates', column: col.header, to: target },
        title: `Padronizar datas de "${col.header}"`,
        description: `Converte as datas de "${col.header}" para ${target}.`,
        affectedCells: affected,
        affectedRows: affected,
      });
    }
  }

  if (duplicateRows > 0) {
    fixes.push({
      id: 'remove_duplicates',
      fix: { kind: 'remove_duplicates' },
      title: 'Remover linhas duplicadas',
      description: `${duplicateRows} linha(s) repetem por completo uma linha anterior.`,
      affectedCells: 0,
      affectedRows: duplicateRows,
    });
  }
  return fixes;
}

/** Resumo de integridade de uma planilha. */
export function analyzeSheetHealth(sheet: Sheet): TableHealth {
  const columns = listColumns(sheet);
  const rows = dataRowIndexes(sheet, columns).slice(0, MAX_ANALYZED_ROWS);
  const scans = columns.map(column => scanColumn(sheet, column, rows));
  const summaries = scans.map(scan => summarize(scan, rows.length));

  // Duplicatas exatas (a partir da segunda ocorrência).
  const seen = new Set<string>();
  const isDuplicate: boolean[] = rows.map(row => {
    const signature = rowSignature(columns.map(col => cellValue(sheet, row, col.index)));
    if (seen.has(signature)) return true;
    seen.add(signature);
    return false;
  });
  const duplicateRowSample: number[] = [];
  isDuplicate.forEach((dup, i) => {
    if (dup && duplicateRowSample.length < 20) duplicateRowSample.push(i);
  });
  const duplicateRows = isDuplicate.filter(Boolean).length;

  let consistentRows = 0;
  rows.forEach((_, i) => {
    let ok = !isDuplicate[i];
    for (let c = 0; ok && c < scans.length; c++) {
      const scan = scans[c];
      const summary = summaries[c];
      if (scan.extraSpaces[i]) ok = false;
      const kind = scan.kinds[i];
      if (kind && summary.mixedTypes && kind !== summary.dominantKind) ok = false;
      const format = scan.formats[i];
      if (format && summary.divergentDates && format !== summary.dominantDateFormat) ok = false;
    }
    if (ok) consistentRows++;
  });

  const possibleCells = rows.length * columns.length;
  const filledCells = summaries.reduce((sum, c) => sum + c.filled, 0);

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    dataRows: rows.length,
    columns: summaries,
    consistentRows,
    consistencyPercent: rows.length > 0 ? (consistentRows / rows.length) * 100 : 100,
    completenessPercent: possibleCells > 0 ? (filledCells / possibleCells) * 100 : 100,
    duplicateRows,
    duplicateRowSample,
    fixes: proposeFixes(scans, summaries, duplicateRows),
  };
}

export function analyzeWorkbookHealth(sheets: readonly Sheet[]): TableHealth[] {
  return sheets.map(analyzeSheetHealth);
}
