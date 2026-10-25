// src/utils/workbookImport.ts
// Importação de arquivos do Excel: TODAS as abas entram, cada uma com o cabeçalho certo e os tipos certos.

import * as XLSX from 'xlsx';
import { MergedRegion, Sheet } from '../types/spreadsheet';
import { autoFormatTabularData } from './csvAutoFormatter';
import { filledCount, RawValue } from './tableLayout';

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
    const sheet = autoFormatTabularData(rows, uniqueName(name || fallbackName, taken));
    sheets.push({
      ...sheet,
      id: `sheet-${stamp}-${index + 1}`,
      mergedRegions: mergedRegions(ws, sheet.rowCount, sheet.colCount),
    });
  });
  return { sheets, skipped };
}

/** Lê os bytes de um .xlsx/.xls e devolve as abas prontas. */
export function importWorkbookFile(bytes: Uint8Array, fileName: string): WorkbookImport {
  // cellNF mantém o formato numérico de cada célula, que é como reconhecemos datas e horas.
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellText: true, cellNF: true });
  return workbookToSheets(workbook, fileName.replace(/\.[^/.]+$/, ''));
}
