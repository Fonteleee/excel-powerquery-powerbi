// src/utils/xlsxWriter.ts
// Exportação para .xlsx com tudo o que a planilha tem: valores e fórmulas, fontes, cores, bordas, alinhamento, larguras,
// alturas, mesclagens, ocultos, filtro, formatação condicional (inclusive por fórmula), imagens e gráficos.
// Os gráficos vão como imagem (o arquivo não leva um gráfico editável do Excel).

import ExcelJS from 'exceljs';
import { CellData, CellFormat, ConditionalFormatRule, Sheet } from '../types/spreadsheet';
import { colIndexToLabel, parseNumberSafely } from '../engine/formulaParser';
import { shiftFormula } from '../engine/formulas/addressing';
import { chartToPngDataUrl } from '../features/charts/chartPng';
import { FLOW_SHEET_NAME, serializeFlowToRows } from '../features/relations/excel/flowSheet';
import type { FlowGraph } from '../features/relations/model/graph';
import { translateFormulaToExcelEn } from './excelExporter';

// Mesmas medidas usadas ao importar e ao desenhar sobre a grade.
const ROW_NUMBER_WIDTH = 40;
const HEADER_HEIGHT = 32;
const DEFAULT_COL = 120;
const DEFAULT_ROW = 26;

const argb = (hex: string | undefined): { argb: string } | undefined => {
  if (!hex) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? { argb: `FF${m[1].toUpperCase()}` } : undefined;
};

const NUMBER_TYPES = new Set(['number', 'currency', 'currency_usd', 'currency_eur', 'percentage']);

function numFmt(format: CellFormat | undefined): string | undefined {
  if (!format?.type) return undefined;
  const decimals = Math.max(0, Math.min(10, format.decimals ?? 2));
  const digits = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  switch (format.type) {
    case 'percentage':
      return `0${digits}%`;
    case 'number':
      return `#,##0${digits}`;
    case 'currency':
      return `"R$" #,##0${digits}`;
    case 'currency_usd':
      return `"$" #,##0${digits}`;
    case 'currency_eur':
      return `"€" #,##0${digits}`;
    default:
      return undefined;
  }
}

const BORDER_STYLE = { solid: 'thin', thick: 'medium', double: 'double', dashed: 'dashed' } as const;

function styleCell(cell: ExcelJS.Cell, format: CellFormat | undefined): void {
  if (!format) return;
  const font: Partial<ExcelJS.Font> = {};
  if (format.bold) font.bold = true;
  if (format.italic) font.italic = true;
  if (format.underline) font.underline = true;
  if (format.strike) font.strike = true;
  if (format.fontSize) font.size = format.fontSize;
  if (format.fontFamily) font.name = format.fontFamily;
  const color = argb(format.textColor);
  if (color) font.color = color;
  if (Object.keys(font).length > 0) cell.font = font;

  const fill = argb(format.bgColor);
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: fill };

  const alignment: Partial<ExcelJS.Alignment> = {};
  if (format.align) alignment.horizontal = format.align;
  if (format.valign) alignment.vertical = format.valign;
  if (format.wrap) alignment.wrapText = true;
  if (Object.keys(alignment).length > 0) cell.alignment = alignment;

  const b = format.border;
  if (b && (b.top || b.bottom || b.left || b.right)) {
    const side = { style: BORDER_STYLE[b.style ?? 'solid'] as ExcelJS.BorderStyle, color: argb(b.color) ?? { argb: 'FF000000' } };
    cell.border = { ...(b.top ? { top: side } : {}), ...(b.bottom ? { bottom: side } : {}), ...(b.left ? { left: side } : {}), ...(b.right ? { right: side } : {}) };
  }
}

function cellContent(cell: CellData): ExcelJS.CellValue | undefined {
  const raw = cell.raw;
  const value = cell.value;
  if (typeof raw === 'string' && raw.trim().startsWith('=')) {
    const result = value === null || value === undefined ? undefined : value;
    return { formula: translateFormulaToExcelEn(raw), result } as ExcelJS.CellFormulaValue;
  }
  if (value === null || value === undefined || value === '') return raw === '' || raw === undefined ? undefined : raw;
  if (typeof value === 'number' || typeof value === 'boolean') {
    // Percentual guardado como 5 (= 5%) vai como fração, que é o que o Excel espera.
    if (typeof value === 'number' && cell.format?.type === 'percentage' && value > 1 && value <= 100) return value / 100;
    return value;
  }
  // Texto que parece número só vira número quando a célula foi formatada como número (códigos como "001" ficam texto).
  if (cell.format?.type && NUMBER_TYPES.has(cell.format.type)) {
    const n = parseNumberSafely(value);
    if (n !== null) return cell.format.type === 'percentage' && n > 1 && n <= 100 ? n / 100 : n;
  }
  return String(value);
}

function ruleStyle(rule: ConditionalFormatRule): Partial<ExcelJS.Style> {
  const font = argb(rule.style.textColor);
  const bg = argb(rule.style.bgColor);
  return {
    ...(font ? { font: { color: font } } : {}),
    ...(bg ? { fill: { type: 'pattern', pattern: 'solid', bgColor: bg, fgColor: bg } } : {}),
  } as Partial<ExcelJS.Style>;
}

const refOf = (r: ConditionalFormatRule['range']): string => `${colIndexToLabel(r.startCol)}${r.startRow + 1}:${colIndexToLabel(r.endCol)}${r.endRow + 1}`;

const ICON_SETS = { traffic: '3TrafficLights1', arrows: '3Arrows', stars: '3Stars', flags: '3Flags' } as const;

function addConditionalRules(ws: ExcelJS.Worksheet, rules: ConditionalFormatRule[]): void {
  rules.forEach((rule, index) => {
    const ref = refOf(rule.range);
    const style = ruleStyle(rule);
    const topLeft = `${colIndexToLabel(rule.range.startCol)}${rule.range.startRow + 1}`;
    const literal = (v: string | number | undefined): string => (typeof v === 'number' ? String(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
    const priority = index + 1;
    let built: ExcelJS.ConditionalFormattingRule | null = null;
    switch (rule.type) {
      case 'highlight_greater':
        built = { type: 'cellIs', operator: 'greaterThan', formulae: [literal(rule.value1)], style, priority };
        break;
      case 'highlight_less':
        built = { type: 'cellIs', operator: 'lessThan', formulae: [literal(rule.value1)], style, priority };
        break;
      case 'highlight_between':
        built = { type: 'cellIs', operator: 'between', formulae: [literal(rule.value1), literal(rule.value2)], style, priority };
        break;
      case 'highlight_equal':
        built = { type: 'cellIs', operator: 'equal', formulae: [literal(rule.value1)], style, priority };
        break;
      case 'highlight_text':
        built = { type: 'containsText', operator: 'containsText', text: String(rule.value1 ?? ''), style, priority } as ExcelJS.ConditionalFormattingRule;
        break;
      case 'highlight_duplicate':
        built = { type: 'expression', formulae: [`COUNTIF($${colIndexToLabel(rule.range.startCol)}$${rule.range.startRow + 1}:$${colIndexToLabel(rule.range.endCol)}$${rule.range.endRow + 1},${topLeft})>1`], style, priority };
        break;
      case 'highlight_above_avg':
      case 'highlight_below_avg':
        built = { type: 'aboveAverage', aboveAverage: rule.type === 'highlight_above_avg', style, priority };
        break;
      case 'color_scale_3':
        built = {
          type: 'colorScale',
          cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
          color: [argb(rule.style.minColor) ?? { argb: 'FFF8696B' }, argb(rule.style.midColor) ?? { argb: 'FFFFEB84' }, argb(rule.style.maxColor) ?? { argb: 'FF63BE7B' }],
          priority,
        } as ExcelJS.ConditionalFormattingRule;
        break;
      case 'data_bar':
        built = { type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: argb(rule.style.barColor) ?? { argb: 'FF638EC6' }, priority } as unknown as ExcelJS.ConditionalFormattingRule;
        break;
      case 'icon_set':
        built = {
          type: 'iconSet',
          iconSet: ICON_SETS[rule.style.iconSet ?? 'traffic'],
          cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }],
          priority,
        } as unknown as ExcelJS.ConditionalFormattingRule;
        break;
      case 'custom_formula': {
        if (!rule.formula) return;
        const anchor = rule.anchor ?? { row: rule.range.startRow, col: rule.range.startCol };
        // No arquivo a fórmula é relativa à 1ª célula do intervalo.
        const shifted = shiftFormula(rule.formula, rule.range.startRow - anchor.row, rule.range.startCol - anchor.col);
        built = { type: 'expression', formulae: [translateFormulaToExcelEn(shifted)], style, priority };
        break;
      }
    }
    if (built) ws.addConditionalFormatting({ ref, rules: [built] });
  });
}

/** Posição em pixels sobre a grade → coluna/linha fracionárias do Excel. */
function pixelToCell(sheet: Sheet, x: number, y: number): { col: number; row: number } {
  const hiddenCols = new Set(sheet.hiddenCols);
  const hiddenRows = new Set(sheet.hiddenRows);
  let col = 0;
  let acc = ROW_NUMBER_WIDTH;
  for (; col < 16384; col++) {
    const w = hiddenCols.has(col) ? 0 : sheet.colWidths[col] || DEFAULT_COL;
    if (x < acc + w) break;
    acc += w;
  }
  let row = 0;
  let accY = HEADER_HEIGHT;
  for (; row < 1_048_576; row++) {
    const h = hiddenRows.has(row) ? 0 : sheet.rowHeights[row] || DEFAULT_ROW;
    if (y < accY + h) break;
    accY += h;
  }
  const w = sheet.colWidths[col] || DEFAULT_COL;
  const h = sheet.rowHeights[row] || DEFAULT_ROW;
  return { col: col + Math.max(0, x - acc) / w, row: row + Math.max(0, y - accY) / h };
}

const extensionOf = (dataUrl: string): 'png' | 'jpeg' | 'gif' | null => {
  const m = /^data:image\/(png|jpe?g|gif);base64,/i.exec(dataUrl);
  if (!m) return null;
  return m[1].toLowerCase() === 'png' ? 'png' : m[1].toLowerCase() === 'gif' ? 'gif' : 'jpeg';
};

function uniqueSheetName(wanted: string, taken: Set<string>): string {
  const base = (wanted || 'Planilha').replace(/[\\/?*[\]:]/g, '').substring(0, 31) || 'Planilha';
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.substring(0, 28)} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

export interface XlsxWriteOptions {
  flowGraph?: FlowGraph;
}

/** Monta o .xlsx. Separado do download para poder ser testado. */
export async function buildXlsx(sheets: Sheet[], options: XlsxWriteOptions = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Verxel';
  wb.created = new Date();
  const taken = new Set<string>();
  const sheetNames: Record<string, string> = {};

  for (const sheet of sheets) {
    const name = uniqueSheetName(sheet.name, taken);
    sheetNames[sheet.id] = name;
    const ws = wb.addWorksheet(name, sheet.tabColor ? { properties: { tabColor: argb(sheet.tabColor) } } : undefined);

    let maxR = 0;
    let maxC = 0;
    for (const [key, cell] of Object.entries(sheet.data)) {
      const m = /^R(\d+)C(\d+)$/.exec(key);
      if (!m || !cell) continue;
      const r = Number(m[1]);
      const c = Number(m[2]);
      const content = cellContent(cell);
      const styled = cell.format && (cell.format.bgColor || cell.format.border);
      if (content === undefined && !styled) continue;
      const target = ws.getCell(r + 1, c + 1);
      if (content !== undefined) target.value = content;
      const fmt = numFmt(cell.format);
      if (fmt) target.numFmt = fmt;
      styleCell(target, cell.format);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }

    const lastCol = Math.max(maxC, ...(sheet.hiddenCols ?? []));
    for (let c = 0; c <= lastCol; c++) {
      const col = ws.getColumn(c + 1);
      const px = sheet.colWidths[c];
      if (px) col.width = Math.max(2, Math.round(((px - 5) / 7) * 100) / 100);
      if (sheet.hiddenCols?.includes(c)) col.hidden = true;
    }
    const lastRow = Math.max(maxR, ...(sheet.hiddenRows ?? []));
    for (let r = 0; r <= lastRow; r++) {
      const px = sheet.rowHeights[r];
      const row = ws.getRow(r + 1);
      if (px) row.height = Math.round(px * 0.75 * 100) / 100;
      if (sheet.hiddenRows?.includes(r)) row.hidden = true;
    }

    for (const m of sheet.mergedRegions ?? []) {
      if (m.endRow <= maxR || m.endCol <= maxC) {
        try {
          ws.mergeCells(m.startRow + 1, m.startCol + 1, m.endRow + 1, m.endCol + 1);
        } catch {
          // Mesclagem sobreposta: o Excel não aceita; a primeira vence.
        }
      }
    }

    if (sheet.filterEnabled) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, maxR + 1), column: Math.max(1, maxC + 1) } };
    addConditionalRules(ws, sheet.conditionalRules ?? []);

    const pictures: { src: string; x: number; y: number; width: number; height: number }[] = [];
    for (const image of sheet.images ?? []) pictures.push(image);
    for (const chart of sheet.charts ?? []) {
      const src = chartToPngDataUrl(sheet, chart);
      if (src) pictures.push({ src, x: chart.x, y: chart.y, width: chart.width, height: chart.height });
    }
    for (const pic of pictures) {
      const extension = extensionOf(pic.src);
      if (!extension) continue;
      const id = wb.addImage({ base64: pic.src, extension });
      const tl = pixelToCell(sheet, pic.x, pic.y);
      ws.addImage(id, { tl: { col: tl.col, row: tl.row }, ext: { width: pic.width, height: pic.height } });
    }
  }

  // O fluxo de Relacionamentos viaja numa aba totalmente oculta (_Flow_v1) para ser reimportado.
  if (options.flowGraph) {
    const flow = wb.addWorksheet(FLOW_SHEET_NAME, { state: 'veryHidden' });
    serializeFlowToRows(options.flowGraph, { sheetNames }).forEach(row => flow.addRow(row));
    [8, 18, 40, 7, 60].forEach((width, i) => (flow.getColumn(i + 1).width = width));
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadXlsx(sheets: Sheet[], filename: string, options: XlsxWriteOptions = {}): Promise<void> {
  const buffer = await buildXlsx(sheets, options);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
