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
  // Hora simples: o Excel corta a fração de segundo (383,6 s = 00:06:23); o SheetJS arredondaria para :24.
  if (/^hh?:mm:ss$/i.test(code) && typeof cell.v === 'number' && cell.v >= 0 && cell.v < 1) {
    const total = Math.floor(cell.v * 86400 + 1e-6);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  }
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

interface FilledCells {
  cells: { r: number; c: number; value: RawValue; cell: XLSX.CellObject }[];
  numRows: number;
  numCols: number;
}

/** Só as células com conteúdo (o SheetJS guarda apenas elas): nada de varrer os milhões de endereços vazios. */
function filledCells(ws: XLSX.WorkSheet): FilledCells {
  const out: FilledCells = { cells: [], numRows: 0, numCols: 0 };
  for (const key of Object.keys(ws)) {
    if (key.charCodeAt(0) === 33) continue; // "!ref", "!cols"...
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r >= MAX_IMPORT_ROWS || c >= MAX_IMPORT_COLS) continue;
    const cell = ws[key];
    const value = cellValue(cell);
    if (value === '') continue;
    out.cells.push({ r, c, value, cell });
    if (r + 1 > out.numRows) out.numRows = r + 1;
    if (c + 1 > out.numCols) out.numCols = c + 1;
  }
  return out;
}

/**
 * Número em formato Geral: o Excel corta as casas decimais para caber na largura da coluna
 * (150792,3394 numa coluna estreita aparece como 150792).
 */
function generalFit(value: number, widthPx: number | undefined): Pick<CellFormat, 'type' | 'decimals' | 'grouping'> | undefined {
  const chars = Math.max(1, Math.floor(((widthPx ?? 64) - 5) / 7));
  const text = String(value);
  if (text.length <= chars) return undefined;
  const intLen = String(Math.trunc(Math.abs(value))).length + (value < 0 ? 1 : 0);
  return { type: 'number', decimals: Math.max(0, Math.min(10, chars - intLen - 1)), grouping: false };
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

  const pendingValidations = new Map<string, { raws: RawValidation[]; sheetName: string }>();
  const definedNames = new Map<string, string>();
  for (const n of workbook.Workbook?.Names ?? []) if (n.Name && n.Ref) definedNames.set(n.Name.toLowerCase(), n.Ref);

  workbook.SheetNames.forEach((name, index) => {
    const ws = workbook.Sheets[name];
    const filled = ws ? filledCells(ws) : { cells: [], numRows: 0, numCols: 0 };
    if (filled.cells.length === 0) {
      skipped.push(`${name} (vazia)`);
      return;
    }
    if (sheets.length >= MAX_SHEETS) {
      skipped.push(`${name} (limite de ${MAX_SHEETS} abas)`);
      return;
    }
    const built = faithfulSheet(ws, filled, uniqueName(name || fallbackName, taken), styles, files, index, raws => pendingValidations.set(`sheet-${stamp}-${index + 1}`, { raws, sheetName: name }));
    sheets.push({ ...built, id: `sheet-${stamp}-${index + 1}` });
  });

  // As listas suspensas só podem ser lidas depois de todas as abas existirem (a origem pode estar em outra aba).
  for (const sheet of sheets) {
    const pending = pendingValidations.get(sheet.id);
    if (!pending) continue;
    const validations = pending.raws.flatMap((raw, i) => {
      const list = resolveListValues(raw.formula, pending.sheetName, workbook, definedNames);
      return list ? [{ id: `dv-${i + 1}`, range: raw.range, values: list.values, ...(list.source ? { source: list.source } : {}) }] : [];
    });
    if (validations.length > 0) sheet.validations = validations;
  }
  return { sheets, skipped };
}

/** Opções de uma lista suspensa: texto entre aspas ("a,b,c"), intervalo (de qualquer aba) ou nome definido. */
const MAX_LIST_CELLS = 5000;

function resolveListValues(
  formula: string,
  currentName: string,
  workbook: XLSX.WorkBook,
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
  // Lê direto da aba do arquivo: a origem costuma ficar longe dos dados (ex.: coluna XEP), fora do que é importado.
  const wanted = (ref.sheet ?? currentName).toLowerCase();
  const targetName = workbook.SheetNames.find(n => n.toLowerCase() === wanted);
  const target = targetName ? workbook.Sheets[targetName] : undefined;
  if (!target) return null;
  const seen = new Set<string>();
  const values: string[] = [];
  let visited = 0;
  for (let r = ref.range.startRow; r <= ref.range.endRow && visited < MAX_LIST_CELLS; r++) {
    for (let c = ref.range.startCol; c <= ref.range.endCol && visited++ < MAX_LIST_CELLS; c++) {
      const v = cellValue(target[XLSX.utils.encode_cell({ r, c })]);
      const label = v === '' || v === null || v === undefined ? '' : String(v);
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
function faithfulSheet(ws: XLSX.WorkSheet, filled: FilledCells, name: string, styles: WorkbookStyles, files: ZipFiles, index: number, onValidations: (raw: RawValidation[]) => void): Sheet {
  const numRows = filled.numRows;
  const rowCount = Math.max(numRows + 30, 100);
  const colCount = Math.max(filled.numCols + 6, 20);

  const colWidths: Sheet['colWidths'] = {};
  (ws['!cols'] ?? []).forEach((col, c) => {
    // Largura em caracteres do arquivo × 7 px (fonte padrão Calibri 11) + margem. O `wpx` do SheetJS usa uma
    // largura de dígito errada em alguns arquivos e dobra a coluna.
    if (!col || c >= colCount) return;
    const px = typeof col.width === 'number' && col.width > 0 ? col.width * 7 + 5 : col.wpx;
    if (px) colWidths[c] = Math.round(px);
  });

  const styleOf = styles.cellStyles(index);
  const data: Sheet['data'] = {};
  for (const { r, c, value: v, cell } of filled.cells) {
    const s = styleOf.get(`${r},${c}`);
    const format: CellFormat = s !== undefined ? { ...styles.formatOf(s) } : {};
    if (cell.t === 'n' && typeof v === 'number') {
      const z = typeof cell.z === 'string' ? cell.z : 'General';
      const mapped = z === 'General' ? undefined : numberFormatOf(z);
      if (mapped) Object.assign(format, mapped);
      else if (z === 'General' && !Number.isInteger(v)) Object.assign(format, generalFit(v, colWidths[c]));
    } else if (cell.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) {
      format.align ??= 'right';
    }
    const text = String(v);
    data[cellPosToKey(r, c)] = {
      raw: text,
      value: typeof v === 'number' || typeof v === 'boolean' ? v : text.startsWith('=') ? null : text,
      ...(Object.keys(format).length > 0 ? { format } : {}),
    };
  }
  // Células vazias mas pintadas ou com borda (faixas de título, bordas de tabela) continuam visíveis.
  for (const [pos, s] of styleOf) {
    const [r, c] = pos.split(',').map(Number);
    if (r >= numRows || c >= filled.numCols || data[cellPosToKey(r, c)]) continue;
    const format = styles.formatOf(s);
    if (format && (format.bgColor || format.border)) data[cellPosToKey(r, c)] = { raw: '', value: '', format: { ...format } };
  }

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
