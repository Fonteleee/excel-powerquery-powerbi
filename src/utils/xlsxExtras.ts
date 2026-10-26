// src/utils/xlsxExtras.ts
// O que o SheetJS gratuito nÃ£o lÃª e o Excel guarda em XML prÃ³prio: formataÃ§Ã£o condicional, grÃ¡ficos e imagens.

import { ConditionalFormatRule, ConditionalRuleType, SheetChart, SheetChartType, SheetImage } from '../types/spreadsheet';
import { parseRangeAddress, rangeToAddress } from '../engine/formulaParser';
import { attr, blocks, colorTag, parseTheme, resolveColor, section, sheetPaths, text, ZipFiles } from './xlsxStyles';

const EMU_PER_PX = 9525;
const ROW_NUMBER_WIDTH = 40;
const HEADER_HEIGHT = 32;
const DEFAULT_COL = 120;
const DEFAULT_ROW = 26;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_IMAGES_BYTES = 3_000_000;

export interface SheetGeometry {
  colWidths: { [col: number]: number };
  rowHeights: { [row: number]: number };
  hiddenCols: number[];
  hiddenRows: number[];
}

export interface SheetExtras {
  conditionalRules: ConditionalFormatRule[];
  charts: SheetChart[];
  images: SheetImage[];
}

function dxfStyles(stylesXml: string, theme: string[]): ConditionalFormatRule['style'][] {
  return blocks(`<dxfs>${section(stylesXml, 'dxfs')}</dxfs>`, 'dxf').map(block => {
    const style: ConditionalFormatRule['style'] = {};
    const font = /<font>([\s\S]*?)<\/font>/.exec(block)?.[1];
    const textColor = resolveColor(font ? colorTag(font, 'color') : undefined, theme);
    if (textColor) style.textColor = textColor;
    const fill = /<fill>([\s\S]*?)<\/fill>/.exec(block)?.[1];
    // Em estilos diferenciais a cor do preenchimento sÃ³lido fica em bgColor.
    const bg = resolveColor(fill ? (colorTag(fill, 'bgColor') ?? colorTag(fill, 'fgColor')) : undefined, theme);
    if (bg) style.bgColor = bg;
    return style;
  });
}

function blend(a: string, b: string): string {
  const mix = (i: number) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const ICON_SETS: [RegExp, 'traffic' | 'arrows' | 'stars' | 'flags'][] = [
  [/arrow/i, 'arrows'],
  [/star/i, 'stars'],
  [/flag/i, 'flags'],
  [/./, 'traffic'],
];

function conditionalRules(sheetXml: string, dxfs: ConditionalFormatRule['style'][], theme: string[]): ConditionalFormatRule[] {
  const rules: ConditionalFormatRule[] = [];
  const groupRe = /<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g;
  for (let g = groupRe.exec(sheetXml); g; g = groupRe.exec(sheetXml)) {
    const ranges = (attr(g[1], 'sqref') ?? '')
      .split(/\s+/)
      .map(ref => parseRangeAddress(ref, 1_048_576))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const ruleRe = /<cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cfRule>)/g;
    for (let m = ruleRe.exec(g[2]); m; m = ruleRe.exec(g[2])) {
      const kind = attr(m[1], 'type');
      const body = m[2] ?? '';
      const formulas = [...body.matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map(f => unquote(f[1]));
      const dxfId = attr(m[1], 'dxfId');
      const style: ConditionalFormatRule['style'] = { ...(dxfId !== undefined ? dxfs[Number(dxfId)] : undefined) };
      let type: ConditionalRuleType | undefined;
      let value1: string | number | undefined;
      let value2: string | number | undefined;

      if (kind === 'cellIs') {
        const op = attr(m[1], 'operator');
        const num = (v: string | undefined) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
        value1 = num(formulas[0]);
        value2 = num(formulas[1]);
        if (op === 'greaterThan' || op === 'greaterThanOrEqual') type = 'highlight_greater';
        else if (op === 'lessThan' || op === 'lessThanOrEqual') type = 'highlight_less';
        else if (op === 'between') type = 'highlight_between';
        else if (op === 'equal') type = 'highlight_equal';
      } else if (kind === 'containsText') {
        type = 'highlight_text';
        value1 = attr(m[1], 'text') ?? '';
      } else if (kind === 'duplicateValues') {
        type = 'highlight_duplicate';
      } else if (kind === 'aboveAverage') {
        type = attr(m[1], 'aboveAverage') === '0' ? 'highlight_below_avg' : 'highlight_above_avg';
      } else if (kind === 'colorScale') {
        const colors = [...body.matchAll(/<color\b([^>]*?)\/?>/g)].map(c => resolveColor(c[1], theme)).filter((c): c is string => Boolean(c));
        if (colors.length >= 2) {
          type = 'color_scale_3';
          style.minColor = colors[0];
          style.maxColor = colors[colors.length - 1];
          style.midColor = colors.length >= 3 ? colors[1] : blend(colors[0], colors[colors.length - 1]);
        }
      } else if (kind === 'dataBar') {
        type = 'data_bar';
        style.barColor = resolveColor(colorTag(body, 'color'), theme) ?? '#638ec6';
      } else if (kind === 'iconSet') {
        type = 'icon_set';
        const name = /<iconSet\b([^>]*)>/.exec(body)?.[1];
        style.iconSet = ICON_SETS.find(([re]) => re.test(name ? (attr(name, 'iconSet') ?? '') : ''))![1];
      }
      if (!type) continue;
      for (const range of ranges) {
        rules.push({ id: `cf-${rules.length + 1}`, type, range, ...(value1 !== undefined ? { value1 } : {}), ...(value2 !== undefined ? { value2 } : {}), style });
      }
    }
  }
  return rules;
}

/** Resolve um alvo relativo ("../charts/chart1.xml") a partir da pasta do arquivo que o cita. */
function resolveTarget(baseFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseFile.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function relsOf(files: ZipFiles, file: string): Map<string, string> {
  const dir = file.split('/').slice(0, -1).join('/');
  const name = file.split('/').pop();
  const xml = text(files, `${dir}/_rels/${name}.rels`);
  const map = new Map<string, string>();
  const re = /<Relationship\b([^>]*?)\/?>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) map.set(id, resolveTarget(file, target));
  }
  return map;
}

const CHART_TYPES: [RegExp, SheetChartType][] = [
  [/<c:(?:pie|pie3D|doughnut|ofPie)Chart\b/, 'pie'],
  [/<c:(?:line|line3D|scatter|radar)Chart\b/, 'line'],
  [/<c:(?:area|area3D)Chart\b/, 'area'],
];

function plainRef(ref: string | undefined): { sheet: string; range: string } | null {
  if (!ref) return null;
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(ref.trim());
  if (!m) return null;
  return { sheet: (m[1] ?? m[2]).replace(/''/g, "'"), range: m[3].replace(/\$/g, '') };
}

function chartRange(xml: string, sheetName: string): string | null {
  const refOf = (tag: string, series: string) => plainRef(new RegExp(`<c:${tag}>[\\s\\S]*?<c:f>([^<]*)</c:f>`).exec(series)?.[1]);
  const seriesBlocks = blocks(xml, 'c:ser');
  if (seriesBlocks.length === 0) return null;
  const cat = refOf('cat', seriesBlocks[0]);
  if (!cat || cat.sheet !== sheetName) return null;
  const catRange = parseRangeAddress(cat.range, 1_048_576);
  if (!catRange) return null;
  let startRow = catRange.startRow;
  let startCol = catRange.startCol;
  let endCol = catRange.endCol;
  let hasHeader = false;
  for (const s of seriesBlocks) {
    const val = refOf('val', s);
    if (!val || val.sheet !== sheetName) return null;
    const v = parseRangeAddress(val.range, 1_048_576);
    if (!v) return null;
    startCol = Math.min(startCol, v.startCol);
    endCol = Math.max(endCol, v.endCol);
    const tx = refOf('tx', s);
    const t = tx && tx.sheet === sheetName ? parseRangeAddress(tx.range, 1_048_576) : null;
    if (t && t.startRow === v.startRow - 1) hasHeader = true;
  }
  if (hasHeader) startRow = catRange.startRow - 1;
  return rangeToAddress({ startRow, startCol, endRow: catRange.endRow, endCol });
}

function chartTitle(xml: string): string {
  const title = /<c:title>([\s\S]*?)<\/c:title>/.exec(xml)?.[1] ?? '';
  return [...title.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('').trim();
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };

function toDataUrl(files: ZipFiles, path: string): string | null {
  const entry = files?.[path]?.content as Uint8Array | undefined;
  const mime = MIME[(path.split('.').pop() ?? '').toLowerCase()];
  if (!entry || !mime || entry.length === 0 || entry.length > MAX_IMAGE_BYTES) return null;
  let binary = '';
  for (let i = 0; i < entry.length; i += 0x8000) binary += String.fromCharCode(...entry.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

function num(block: string, tag: string): number {
  return Number(new RegExp(`<xdr:${tag}>(-?\\d+)</xdr:${tag}>`).exec(block)?.[1] ?? 0);
}

function drawings(files: ZipFiles, sheetFile: string, sheetName: string, geo: SheetGeometry): Pick<SheetExtras, 'charts' | 'images'> {
  const out: Pick<SheetExtras, 'charts' | 'images'> = { charts: [], images: [] };
  const drawingTarget = [...relsOf(files, sheetFile).values()].find(t => /\/drawings\/drawing\d+\.xml$/.test(t));
  if (!drawingTarget) return out;
  const xml = text(files, drawingTarget);
  const rels = relsOf(files, drawingTarget);
  const hiddenCols = new Set(geo.hiddenCols);
  const hiddenRows = new Set(geo.hiddenRows);

  const left = (col: number, off: number) => {
    let x = ROW_NUMBER_WIDTH;
    for (let c = 0; c < col; c++) if (!hiddenCols.has(c)) x += geo.colWidths[c] || DEFAULT_COL;
    return x + off / EMU_PER_PX;
  };
  const top = (row: number, off: number) => {
    let y = HEADER_HEIGHT;
    for (let r = 0; r < row; r++) if (!hiddenRows.has(r)) y += geo.rowHeights[r] || DEFAULT_ROW;
    return y + off / EMU_PER_PX;
  };

  let imageBytes = 0;
  const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g;
  for (let a = anchorRe.exec(xml); a; a = anchorRe.exec(xml)) {
    const body = a[2];
    const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(body)?.[1];
    const to = /<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(body)?.[1];
    const ext = /<xdr:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    if (from) {
      x = left(num(from, 'col'), num(from, 'colOff'));
      y = top(num(from, 'row'), num(from, 'rowOff'));
      if (to) {
        width = left(num(to, 'col'), num(to, 'colOff')) - x;
        height = top(num(to, 'row'), num(to, 'rowOff')) - y;
      }
    }
    if ((!to || width <= 0) && ext) {
      width = Number(ext[1]) / EMU_PER_PX;
      height = Number(ext[2]) / EMU_PER_PX;
    }
    if (width <= 0 || height <= 0) continue;
    const geometry = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };

    const chartRid = /<c:chart\b[^>]*r:id="([^"]+)"/.exec(body)?.[1];
    if (chartRid) {
      const chartXml = text(files, rels.get(chartRid) ?? '');
      const range = chartXml ? chartRange(chartXml, sheetName) : null;
      if (!range) continue;
      const type = CHART_TYPES.find(([re]) => re.test(chartXml))?.[1] ?? 'bar';
      out.charts.push({
        id: `xl-chart-${out.charts.length + 1}`,
        title: chartTitle(chartXml) || 'GrÃ¡fico',
        type,
        range,
        ...geometry,
        width: Math.max(240, geometry.width),
        height: Math.max(160, geometry.height),
      });
      continue;
    }
    const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(body)?.[1];
    if (embed) {
      const src = toDataUrl(files, rels.get(embed) ?? '');
      if (!src || imageBytes + src.length > MAX_IMAGES_BYTES) continue;
      imageBytes += src.length;
      out.images.push({ id: `xl-image-${out.images.length + 1}`, src, ...geometry });
    }
  }
  return out;
}

export function readSheetExtras(files: ZipFiles, sheetIndex: number, sheetName: string, geo: SheetGeometry): SheetExtras {
  const sheetFile = sheetPaths(files)[sheetIndex];
  if (!sheetFile) return { conditionalRules: [], charts: [], images: [] };
  const theme = parseTheme(text(files, 'xl/theme/theme1.xml'));
  const dxfs = dxfStyles(text(files, 'xl/styles.xml'), theme);
  return {
    conditionalRules: conditionalRules(text(files, sheetFile), dxfs, theme),
    ...drawings(files, sheetFile, sheetName, geo),
  };
}
