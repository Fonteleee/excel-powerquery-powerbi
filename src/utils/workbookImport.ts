// src/utils/workbookImport.ts
// Importação de arquivos do Excel: TODAS as abas entram, cada uma com o cabeçalho certo e os tipos certos.

import * as XLSX from 'xlsx';
import { CellFormat, MergedRegion, Sheet } from '../types/spreadsheet';
import { cellPosToKey } from '../engine/formulaParser';
import { filledCount, RawValue } from './tableLayout';
import { numberFormatOf, readWorkbookStyles, WorkbookStyles } from './xlsxStyles';

const MAX_IMPORT_ROWS = 100_000;
const MAX_IMPORT_COLS = 200;
const MAX_SHEETS = 50;

/** Valor de uma célula do arquivo: número continua número; data/hora vira o texto como aparece no Excel. */
function cellValue(cell: XLSX.CellObject | undefined): RawValue {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  switch (cell.t) {
    case 'n':
      // Datas e horas são números com formato; o texto formatado preserva "05/01/2024" e "03:17:26".
      if (typeof cell.z === 'string' && cell.w && XLSX.SSF.is_date(cell.z)) return cell.w;
      return typeof cell.v === 'number' ? cell.v : Number(cell.v);
    case 'b':
      return Boolean(cell.v);
    case 'd':
      return cell.w ?? String(cell.v);
    case 'e':
      return cell.w ?? '';
    default:
      return String(cell.v);
  }
}

/** Matriz de valores da aba, mantendo cada coisa na posição original (A1 é A1). */
export function worksheetToRows(ws: XLSX.WorkSheet): RawValue[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const lastRow = Math.min(range.e.r, MAX_IMPORT_ROWS - 1);
  const lastCol = Math.min(range.e.c, MAX_IMPORT_COLS - 1);
  const rows: RawValue[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    const row: RawValue[] = [];
    for (let c = 0; c <= lastCol; c++) row.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })]));
    rows.push(row);
  }
  while (rows.length > 0 && filledCount(rows[rows.length - 1]) === 0) rows.pop();
  return rows;
}

function mergedRegions(ws: XLSX.WorkSheet, rows: number, cols: number): MergedRegion[] {
  return (ws['!merges'] ?? [])
    .filter(m => m.s.r < rows && m.s.c < cols && (m.e.r > m.s.r || m.e.c > m.s.c))
    .map((m, i) => ({
      id: `merge-${i + 1}`,
      startRow: m.s.r,
      startCol: m.s.c,
      endRow: Math.min(m.e.r, rows - 1),
      endCol: Math.min(m.e.c, cols - 1),
    }));
}

function uniqueName(wanted: string, taken: Set<string>): string {
  const base = wanted.trim().slice(0, 64) || 'Planilha';
  let name = base;
  let n = 2;
  while (taken.has(name.toLowerCase())) name = `${base} (${n++})`;
  taken.add(name.toLowerCase());
  return name;
}

export interface WorkbookImport {
  sheets: Sheet[];
  /** Abas ignoradas por estarem vazias ou além do limite. */
  skipped: string[];
}

/** Converte o arquivo inteiro. Abas vazias são ignoradas; o limite é de 50 abas por arquivo. */
export function workbookToSheets(workbook: XLSX.WorkBook, fallbackName = 'Planilha'): WorkbookImport {
  const sheets: Sheet[] = [];
  const skipped: string[] = [];
  const taken = new Set<string>();
  const stamp = Date.now().toString(36);
  const styles = readWorkbookStyles((workbook as { files?: Record<string, { content?: unknown }> }).files);

  workbook.SheetNames.forEach((name, index) => {
    const ws = workbook.Sheets[name];
    const rows = ws ? worksheetToRows(ws) : [];
    if (rows.length === 0) {
      skipped.push(`${name} (vazia)`);
      return;
    }
    if (sheets.length >= MAX_SHEETS) {
      skipped.push(`${name} (limite de ${MAX_SHEETS} abas)`);
      return;
    }
    sheets.push({
      ...faithfulSheet(ws, rows, uniqueName(name || fallbackName, taken), styles, index),
      id: `sheet-${stamp}-${index + 1}`,
    });
  });
  return { sheets, skipped };
}

/**
 * A aba como está no arquivo: mesmos valores nas mesmas células, com as cores, fontes, bordas, alinhamentos,
 * larguras, alturas, mesclagens e filtro do Excel. Nada de cabeçalho recolorido nem tipos adivinhados.
 */
function faithfulSheet(ws: XLSX.WorkSheet, rows: RawValue[][], name: string, styles: WorkbookStyles, index: number): Sheet {
  const numRows = rows.length;
  let numCols = 0;
  rows.forEach(row => (numCols = Math.max(numCols, row.length)));
  const rowCount = Math.max(numRows + 30, 100);
  const colCount = Math.max(numCols + 6, 20);

  const styleOf = styles.cellStyles(index);
  const data: Sheet['data'] = {};
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const v = rows[r][c];
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const s = styleOf.get(`${r},${c}`);
      const format: CellFormat = { ...(s !== undefined ? styles.formatOf(s) : undefined) };
      if (cell?.t === 'n' && typeof cell.z === 'string') {
        if (XLSX.SSF.is_date(cell.z)) format.align ??= 'right';
        else Object.assign(format, numberFormatOf(cell.z));
      }
      const hasFormat = Object.keys(format).length > 0;
      if (v === '' || v === null || v === undefined) {
        // Célula vazia mas pintada ou com borda (faixas de título, bordas de tabela) continua visível.
        if (format.bgColor || format.border) data[cellPosToKey(r, c)] = { raw: '', value: '', format };
        continue;
      }
      const text = String(v);
      data[cellPosToKey(r, c)] = {
        raw: text,
        value: typeof v === 'number' || typeof v === 'boolean' ? v : text.startsWith('=') ? null : text,
        ...(hasFormat ? { format } : {}),
      };
    }
  }

  const colWidths: Sheet['colWidths'] = {};
  (ws['!cols'] ?? []).forEach((col, c) => {
    if (col && col.wpx && c < colCount) colWidths[c] = Math.round(col.wpx);
  });
  const rowHeights: Sheet['rowHeights'] = {};
  (ws['!rows'] ?? []).forEach((row, r) => {
    if (row && row.hpx && r < rowCount) rowHeights[r] = Math.round(row.hpx);
  });

  const tabColor = styles.tabColor(index);
  return {
    id: `sheet-${Date.now()}`,
    name,
    data,
    rowCount,
    colCount,
    colWidths,
    rowHeights,
    mergedRegions: mergedRegions(ws, rowCount, colCount),
    conditionalRules: [],
    ...(tabColor ? { tabColor } : {}),
    ...(ws['!autofilter'] ? { filterEnabled: true } : {}),
  };
}

/** Lê os bytes de um .xlsx/.xls e devolve as abas prontas. */
export function importWorkbookFile(bytes: Uint8Array, fileName: string): WorkbookImport {
  // cellNF mantém o formato numérico de cada célula, que é como reconhecemos datas e horas.
  // bookFiles guarda o XML original (de onde saem fontes e bordas); cellStyles traz larguras e alturas.
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellText: true, cellNF: true, cellStyles: true, bookFiles: true });
  return workbookToSheets(workbook, fileName.replace(/\.[^/.]+$/, ''));
}
