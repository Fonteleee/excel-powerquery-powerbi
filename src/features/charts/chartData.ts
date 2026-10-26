// src/features/charts/chartData.ts
// Dados dos gráficos dentro da planilha. Puro: lê as células do intervalo e devolve o modelo pronto para desenhar.

import { CellPosition, CellRange, Sheet, SheetChart, SheetChartType } from '../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel, parseNumberSafely, parseRangeAddress, rangeToAddress } from '../../engine/formulaParser';

export const CHART_COLORS = ['#107c41', '#2563eb', '#f59e0b', '#7c3aed', '#ec4899', '#06b6d4', '#14b8a6', '#ef4444'];
export const MAX_CHART_POINTS = 200;
export const MAX_CHART_SERIES = 12;
const DEFAULT_SIZE = { width: 460, height: 300 };

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

export interface ChartModel {
  ok: boolean;
  /** Motivo em português quando `ok` é falso. */
  error?: string;
  xKey: string;
  series: ChartSeries[];
  data: Record<string, string | number>[];
  /** Linhas que não couberam (limite de pontos). */
  truncated: number;
}

const failed = (error: string): ChartModel => ({ ok: false, error, xKey: 'x', series: [], data: [], truncated: 0 });

function cellValue(sheet: Sheet, row: number, col: number): string | number | boolean | null {
  const cell = sheet.data[cellPosToKey(row, col)];
  if (!cell) return null;
  const v = cell.value ?? cell.raw;
  return v === '' ? null : (v as string | number | boolean | null);
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') return parseNumberSafely(v);
  return null;
}

const isFilled = (sheet: Sheet, row: number, col: number): boolean => cellValue(sheet, row, col) !== null;

/** Bloco contíguo de células preenchidas que contém (row, col), como o Ctrl+* do Excel. */
export function detectRegion(sheet: Sheet, row: number, col: number): CellRange {
  const rowHas = (r: number, c0: number, c1: number): boolean => {
    for (let c = c0; c <= c1; c++) if (isFilled(sheet, r, c)) return true;
    return false;
  };
  const colHas = (c: number, r0: number, r1: number): boolean => {
    for (let r = r0; r <= r1; r++) if (isFilled(sheet, r, c)) return true;
    return false;
  };
  let r0 = row;
  let r1 = row;
  let c0 = col;
  let c1 = col;
  for (let changed = true; changed; ) {
    changed = false;
    if (r0 > 0 && rowHas(r0 - 1, Math.max(0, c0 - 1), c1 + 1)) (r0--, (changed = true));
    if (r1 + 1 < sheet.rowCount && rowHas(r1 + 1, Math.max(0, c0 - 1), c1 + 1)) (r1++, (changed = true));
    if (c0 > 0 && colHas(c0 - 1, Math.max(0, r0 - 1), r1 + 1)) (c0--, (changed = true));
    if (c1 + 1 < sheet.colCount && colHas(c1 + 1, Math.max(0, r0 - 1), r1 + 1)) (c1++, (changed = true));
  }
  return { startRow: r0, startCol: c0, endRow: r1, endCol: c1 };
}

/** Modelo do gráfico a partir do intervalo: 1ª coluna = categorias; colunas com números = séries. */
export function chartModel(sheet: Sheet, chart: Pick<SheetChart, 'range' | 'type'>): ChartModel {
  const range = parseRangeAddress(chart.range, sheet.rowCount);
  if (!range) return failed(`Intervalo "${chart.range}" inválido.`);
  const width = range.endCol - range.startCol + 1;
  if (width < 2) return failed('O gráfico precisa de pelo menos duas colunas: categorias e valores.');

  // A primeira linha é cabeçalho quando nenhuma célula dela (fora a 1ª coluna) é número.
  let firstDataRow = range.startRow;
  const headerLooksText = Array.from({ length: width - 1 }, (_, i) => cellValue(sheet, range.startRow, range.startCol + 1 + i)).every(
    v => v === null || numeric(v) === null
  );
  const hasHeader = headerLooksText && range.endRow > range.startRow;
  if (hasHeader) firstDataRow++;

  const series: ChartSeries[] = [];
  for (let c = range.startCol + 1; c <= range.endCol && series.length < MAX_CHART_SERIES; c++) {
    let hasNumber = false;
    for (let r = firstDataRow; r <= range.endRow && !hasNumber; r++) hasNumber = numeric(cellValue(sheet, r, c)) !== null;
    if (!hasNumber) continue;
    const header = hasHeader ? cellValue(sheet, range.startRow, c) : null;
    const name = header !== null ? String(header) : `Série ${series.length + 1}`;
    series.push({ key: `s${c - range.startCol}`, name, color: CHART_COLORS[series.length % CHART_COLORS.length] });
  }
  if (series.length === 0) return failed('Não há números nas colunas à direita da primeira. Selecione dados numéricos.');

  const xHeader = hasHeader ? cellValue(sheet, range.startRow, range.startCol) : null;
  const xKey = xHeader !== null && String(xHeader).trim() !== '' ? String(xHeader) : 'Categoria';
  const data: Record<string, string | number>[] = [];
  let truncated = 0;
  for (let r = firstDataRow; r <= range.endRow; r++) {
    const label = cellValue(sheet, r, range.startCol);
    const values = series.map(s => numeric(cellValue(sheet, r, range.startCol + Number(s.key.slice(1)))));
    if (label === null && values.every(v => v === null)) continue;
    if (data.length >= MAX_CHART_POINTS) {
      truncated++;
      continue;
    }
    const point: Record<string, string | number> = { [xKey]: label === null ? '' : String(label) };
    series.forEach((s, i) => {
      point[s.key] = values[i] ?? 0;
    });
    data.push(point);
  }
  if (data.length === 0) return failed('O intervalo não tem linhas de dados.');
  return { ok: true, xKey, series, data, truncated };
}

export type NewChartResult = { ok: true; chart: SheetChart } | { ok: false; error: string };

/** Largura do número de linha à esquerda da planilha. */
const ROW_NUMBER_WIDTH = 40;
const DEFAULT_COL_WIDTH = 120;

/** Posição inicial: à direita dos dados (para não cobri-los) e escalonada se já houver outros gráficos. */
function nextSpot(sheet: Sheet, range: CellRange, existing: readonly SheetChart[]): { x: number; y: number } {
  let right = ROW_NUMBER_WIDTH;
  for (let c = 0; c <= range.endCol; c++) right += sheet.colWidths[c] || DEFAULT_COL_WIDTH;
  const n = existing.length;
  return { x: right + 24 + (n % 3) * 28, y: 40 + (n % 6) * 28 };
}

export function createChart(
  sheet: Sheet,
  options: { range: string; type?: SheetChartType; title?: string },
  existing: readonly SheetChart[] = sheet.charts ?? []
): NewChartResult {
  const type = options.type ?? 'bar';
  const model = chartModel(sheet, { range: options.range, type });
  if (!model.ok) return { ok: false, error: model.error ?? 'Não foi possível criar o gráfico.' };
  const taken = new Set(existing.map(c => c.id));
  let n = 1;
  while (taken.has(`chart-${n}`)) n++;
  return {
    ok: true,
    chart: {
      id: `chart-${n}`,
      title: options.title?.trim() || (model.series.length === 1 ? `${model.series[0].name} por ${model.xKey}` : `Gráfico de ${model.series.map(s => s.name).join(', ')}`).slice(0, 80),
      type,
      range: options.range,
      ...nextSpot(sheet, parseRangeAddress(options.range, sheet.rowCount)!, existing),
      ...DEFAULT_SIZE,
    },
  };
}

/** Gráfico a partir da seleção do usuário; com uma célula só, usa a região de dados em volta dela. */
export function chartFromSelection(sheet: Sheet, selection: CellRange, active: CellPosition, type: SheetChartType = 'bar'): NewChartResult {
  const single = selection.startRow === selection.endRow && selection.startCol === selection.endCol;
  const range = single ? detectRegion(sheet, active.row, active.col) : selection;
  if (!isFilled(sheet, range.startRow, range.startCol) && single) {
    return { ok: false, error: 'Selecione as células com os dados (ou clique em uma célula da tabela) para criar o gráfico.' };
  }
  return createChart(sheet, { range: rangeToAddress(range), type });
}

/** Rótulo curto da coluna, para mensagens: "B" -> "coluna B". */
export const columnLabel = (col: number): string => `coluna ${colIndexToLabel(col)}`;
