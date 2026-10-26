// src/utils/workbookImport.ts
// Importação de arquivos do Excel: TODAS as abas entram, cada uma com o cabeçalho certo e os tipos certos.

import * as XLSX from 'xlsx';
import { CellFormat, MergedRegion, Sheet } from '../types/spreadsheet';
import { cellPosToKey } from '../engine/formulaParser';
import { filledCount, RawValue } from './tableLayout';
import { RawValidation, readSheetExtras, splitSheetRef } from './xlsxExtras';
import { numberFormatOf, readWorkbookStyles, WorkbookStyles, ZipFiles } from './xlsxStyles';

const MAX_IMPORT_ROWS = 100_000;
const MAX_IMPORT_COLS = 200;
const MAX_SHEETS = 50;

/**
 * Texto de uma data/hora como o Excel brasileiro mostra. O Excel guarda alguns formatos como "do sistema"
 * (`m/d/yy`, `[$-F400]` = hora longa) e mostra no padrão do Windows; o SheetJS os mostraria no padrão americano.
 */
export function dateText(cell: XLSX.CellObject): string {
  const z = String(cell.z);
  const code = /\[\$-F400\]/i.test(z) ? 'hh:mm:ss' : /\[\$-F800\]/i.test(z) || /^(m\/d\/yy|mm-dd-yy)$/i.test(z) ? 'd/m/yyyy' : z;
  try {
    return XLSX.SSF.format(code, cell.v as number);
  } catch {
    return cell.w ?? String(cell.v);
  }
}

/** Valor de uma célula do arquivo: número continua número; data/hora vira o texto como aparece no Excel. */
function cellValue(cell: XLSX.CellObject | undefined): RawValue {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  switch (cell.t) {
    case 'n':
      // Datas e horas são números com formato; o texto formatado preserva "05/01/2024" e "03:17:26".
      if (typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) return dateText(cell);
      // Sem formato (Geral) o Excel mostra até 15 dígitos significativos: 150792.33940000006 aparece como 150792.3394.
      return typeof cell.v === 'number' ? Number(cell.v.toPrecision(15)) : Number(cell.v);
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
  const files = (workbook as { files?: ZipFiles }).files;
  const styles = readWorkbookStyles(files);

  const pendingValidations = new Map<string, RawValidation[]>();
  const definedNames = new Map<string, string>();
  for (const n of workbook.Workbook?.Names ?? []) if (n.Name && n.Ref) definedNames.set(n.Name.toLowerCase(), n.Ref);

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
    const built = faithfulSheet(ws, rows, uniqueName(name || fallbackName, taken), styles, files, index, raw => pendingValidations.set(`sheet-${stamp}-${index + 1}`, raw));
    sheets.push({ ...built, id: `sheet-${stamp}-${index + 1}` });
  });

  // As listas suspensas só podem ser lidas depois de todas as abas existirem (a origem pode estar em outra aba).
  for (const sheet of sheets) {
    const raws = pendingValidations.get(sheet.id);
    if (!raws) continue;
    const validations = raws.flatMap((raw, i) => {
      const list = resolveListValues(raw.formula, sheet, sheets, definedNames);
      return list ? [{ id: `dv-${i + 1}`, range: raw.range, values: list.values, ...(list.source ? { source: list.source } : {}) }] : [];
    });
    if (validations.length > 0) sheet.validations = validations;
  }
  return { sheets, skipped };
}

/** Opções de uma lista suspensa: texto entre aspas ("a,b,c"), intervalo (de qualquer aba) ou nome definido. */
function resolveListValues(
  formula: string,
  current: Sheet,
  all: Sheet[],
  names: Map<string, string>
): { values: string[]; source?: string } | null {
  const text = formula.replace(/^=/, '').trim();
  if (text.startsWith('"')) {
    const values = text.replace(/^"|"$/g, '').split(',').map(v => v.trim()).filter(Boolean);
    return values.length > 0 ? { values } : null;
  }
  const source = names.get(text.toLowerCase()) ?? text;
  const ref = splitSheetRef(source);
  if (!ref) return null;
  const target = ref.sheet ? all.find(s => s.name.toLowerCase() === ref.sheet!.toLowerCase()) : current;
  if (!target) return null;
  const seen = new Set<string>();
  const values: string[] = [];
  for (let r = ref.range.startRow; r <= Math.min(ref.range.endRow, target.rowCount - 1); r++) {
    for (let c = ref.range.startCol; c <= Math.min(ref.range.endCol, target.colCount - 1); c++) {
      const v = target.data[cellPosToKey(r, c)]?.value;
      const label = v === null || v === undefined ? '' : String(v);
      if (label !== '' && !seen.has(label)) {
        seen.add(label);
        values.push(label);
      }
    }
  }
  return values.length > 0 ? { values, source } : null;
}

/**
 * A aba como está no arquivo: mesmos valores nas mesmas células, com as cores, fontes, bordas, alinhamentos,
 * larguras, alturas, mesclagens e filtro do Excel. Nada de cabeçalho recolorido nem tipos adivinhados.
 */
function faithfulSheet(ws: XLSX.WorkSheet, rows: RawValue[][], name: string, styles: WorkbookStyles, files: ZipFiles, index: number, onValidations: (raw: RawValidation[]) => void): Sheet {
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
    // Largura em caracteres do arquivo × 7 px (fonte padrão Calibri 11) + margem. O `wpx` do SheetJS usa uma
    // largura de dígito errada em alguns arquivos e dobra a coluna.
    if (!col || c >= colCount) return;
    const px = typeof col.width === 'number' && col.width > 0 ? col.width * 7 + 5 : col.wpx;
    if (px) colWidths[c] = Math.round(px);
  });
  const rowHeights: Sheet['rowHeights'] = {};
  (ws['!rows'] ?? []).forEach((row, r) => {
    if (row && row.hpx && r < rowCount) rowHeights[r] = Math.round(row.hpx);
  });

  const hiddenCols = (ws['!cols'] ?? []).flatMap((col, c) => (col?.hidden && c < colCount ? [c] : []));
  const hiddenRows = (ws['!rows'] ?? []).flatMap((row, r) => (row?.hidden && r > 0 && r < rowCount ? [r] : []));
  const extras = readSheetExtras(files, index, name, { colWidths, rowHeights, hiddenCols, hiddenRows });

  if (extras.validations.length > 0) onValidations(extras.validations);
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
    conditionalRules: extras.conditionalRules,
    ...(extras.charts.length > 0 ? { charts: extras.charts } : {}),
    ...(extras.images.length > 0 ? { images: extras.images } : {}),
    ...(hiddenCols.length > 0 ? { hiddenCols } : {}),
    ...(hiddenRows.length > 0 ? { hiddenRows } : {}),
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
