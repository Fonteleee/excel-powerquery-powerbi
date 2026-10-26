// src/utils/xlsxStyles.ts
// Lê do próprio arquivo .xlsx o que o SheetJS gratuito não entrega: fonte, cores, bordas, alinhamento e abas coloridas.
// Sem DOMParser: o XML do Excel tem sempre a mesma forma, e assim isto roda também nos testes (Node).

import { CellBorder, CellFormat, CellFormatType } from '../types/spreadsheet';

type ZipFiles = Record<string, { content?: unknown }> | undefined;

interface XlFont {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  size?: number;
  name?: string;
  color?: string;
}

interface XlXf {
  fontId: number;
  fillId: number;
  borderId: number;
  horizontal?: string;
  vertical?: string;
  wrap?: boolean;
}

export interface WorkbookStyles {
  /** Formato visual da célula a partir do índice de estilo `s` do XML da aba. */
  formatOf(styleIndex: number): CellFormat | undefined;
  /** Índice de estilo (`s`) de cada célula da aba (chave "linha,coluna", base 0). */
  cellStyles(sheetIndex: number): Map<string, number>;
  tabColor(sheetIndex: number): string | undefined;
}

const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '5B9BD5', 'ED7D31', 'A5A5A5', 'FFC000', '4472C4', '70AD47', '0563C1', '954F72'];
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF'];

const MAX_STYLED_CELLS = 400_000;

function text(files: ZipFiles, path: string): string {
  const entry = files?.[path]?.content;
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  try {
    return new TextDecoder('utf-8').decode(entry as Uint8Array);
  } catch {
    return '';
  }
}

function attr(source: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(source);
  return m ? m[1] : undefined;
}

/** Atributo booleano de elementos como <b/> ou <b val="0"/>. */
function flag(block: string, tag: string): boolean | undefined {
  const m = new RegExp(`<${tag}(\\s[^>]*)?/?>`).exec(block);
  if (!m) return undefined;
  const val = m[1] ? attr(m[1], 'val') : undefined;
  return val === undefined ? true : !(val === '0' || val === 'false' || val === 'none');
}

function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1] ?? '');
  return out;
}

function section(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : '';
}

function parseTheme(xml: string): string[] {
  const palette = [...DEFAULT_THEME];
  THEME_ORDER.forEach((name, i) => {
    const m = new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`).exec(xml);
    if (!m) return;
    const rgb = /srgbClr val="([0-9A-Fa-f]{6})"/.exec(m[1]) ?? /lastClr="([0-9A-Fa-f]{6})"/.exec(m[1]);
    if (rgb) palette[i] = rgb[1];
  });
  return palette;
}

function applyTint(hex: string, tint: number): string {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    const out = tint < 0 ? v * (1 + tint) : v + (255 - v) * tint;
    return Math.max(0, Math.min(255, Math.round(out))).toString(16).padStart(2, '0');
  };
  return `${channel(0)}${channel(2)}${channel(4)}`;
}

/** Cor de um elemento <color .../> ou <fgColor .../>: rgb, tema (com tonalidade) ou índice. */
function resolveColor(source: string | undefined, theme: string[]): string | undefined {
  if (!source) return undefined;
  let hex: string | undefined;
  const rgb = attr(source, 'rgb');
  const themeIdx = attr(source, 'theme');
  const indexed = attr(source, 'indexed');
  if (rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb)) hex = rgb.slice(-6);
  else if (themeIdx !== undefined) hex = theme[Number(themeIdx)];
  else if (indexed !== undefined) hex = INDEXED[Number(indexed)];
  if (!hex) return undefined;
  const tint = Number(attr(source, 'tint') ?? 0);
  if (tint) hex = applyTint(hex, tint);
  return `#${hex.toLowerCase()}`;
}

function colorTag(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(\\s[^>]*)?/?>`).exec(block);
  return m ? (m[1] ?? '') : undefined;
}

function parseFonts(xml: string, theme: string[]): XlFont[] {
  return blocks(section(xml, 'fonts') ? `<fonts>${section(xml, 'fonts')}</fonts>` : '', 'font').map(block => {
    const sz = colorTag(block, 'sz');
    const name = colorTag(block, 'name');
    return {
      bold: flag(block, 'b'),
      italic: flag(block, 'i'),
      underline: flag(block, 'u'),
      strike: flag(block, 'strike'),
      size: sz ? Number(attr(sz, 'val')) || undefined : undefined,
      name: name ? attr(name, 'val') : undefined,
      color: resolveColor(colorTag(block, 'color'), theme),
    };
  });
}

function parseFills(xml: string, theme: string[]): (string | undefined)[] {
  return blocks(`<fills>${section(xml, 'fills')}</fills>`, 'fill').map(block => {
    const pattern = /<patternFill([^>]*?)\/?>/.exec(block);
    const type = pattern ? attr(pattern[1], 'patternType') : undefined;
    if (type !== 'solid') return undefined;
    return resolveColor(colorTag(block, 'fgColor'), theme);
  });
}

const BORDER_STYLE: Record<string, CellBorder['style']> = {
  thin: 'solid',
  hair: 'solid',
  dotted: 'solid',
  medium: 'thick',
  thick: 'thick',
  double: 'double',
  dashed: 'dashed',
  mediumDashed: 'dashed',
  dashDot: 'dashed',
  mediumDashDot: 'dashed',
  dashDotDot: 'dashed',
  mediumDashDotDot: 'dashed',
  slantDashDot: 'dashed',
};

function parseBorders(xml: string, theme: string[]): (CellBorder | undefined)[] {
  return blocks(`<borders>${section(xml, 'borders')}</borders>`, 'border').map(block => {
    const border: CellBorder = {};
    let any = false;
    for (const [tag, key] of [['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right']] as const) {
      const m = new RegExp(`<${tag}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${tag}>)`).exec(block);
      const style = m && m[1] ? attr(m[1], 'style') : undefined;
      if (!style) continue;
      border[key] = true;
      any = true;
      border.style = border.style === 'thick' ? 'thick' : (BORDER_STYLE[style] ?? 'solid');
      const color = resolveColor(m![2] ? colorTag(m![2], 'color') : undefined, theme);
      if (color && !border.color) border.color = color;
    }
    return any ? border : undefined;
  });
}

function parseCellXfs(xml: string): XlXf[] {
  const body = section(xml, 'cellXfs');
  const out: XlXf[] = [];
  const re = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const align = m[2] ? colorTag(m[2], 'alignment') : undefined;
    out.push({
      fontId: Number(attr(m[1], 'fontId') ?? 0),
      fillId: Number(attr(m[1], 'fillId') ?? 0),
      borderId: Number(attr(m[1], 'borderId') ?? 0),
      horizontal: align ? attr(align, 'horizontal') : undefined,
      vertical: align ? attr(align, 'vertical') : undefined,
      wrap: align ? attr(align, 'wrapText') === '1' || attr(align, 'wrapText') === 'true' : undefined,
    });
  }
  return out;
}

function toFormat(xf: XlXf, fonts: XlFont[], fills: (string | undefined)[], borders: (CellBorder | undefined)[]): CellFormat | undefined {
  const format: CellFormat = {};
  const font = fonts[xf.fontId];
  if (font) {
    if (font.bold) format.bold = true;
    if (font.italic) format.italic = true;
    if (font.underline) format.underline = true;
    if (font.strike) format.strike = true;
    if (font.size && font.size !== 11) format.fontSize = font.size;
    if (font.name && font.name !== 'Calibri') format.fontFamily = font.name;
    if (font.color && font.color !== '#000000') format.textColor = font.color;
  }
  const bg = fills[xf.fillId];
  if (bg) format.bgColor = bg;
  const border = borders[xf.borderId];
  if (border) format.border = border;
  if (xf.horizontal === 'left') format.align = 'left';
  else if (xf.horizontal === 'right') format.align = 'right';
  else if (xf.horizontal === 'center' || xf.horizontal === 'centerContinuous') format.align = 'center';
  if (xf.vertical === 'top') format.valign = 'top';
  else if (xf.vertical === 'center') format.valign = 'middle';
  else if (xf.vertical === 'bottom') format.valign = 'bottom';
  if (xf.wrap) format.wrap = true;
  return Object.keys(format).length > 0 ? format : undefined;
}

/** Caminho de cada aba (na ordem do arquivo) dentro do .xlsx. */
function sheetPaths(files: ZipFiles): string[] {
  const workbook = text(files, 'xl/workbook.xml');
  const rels = text(files, 'xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  const relRe = /<Relationship\b([^>]*?)\/?>/g;
  for (let m = relRe.exec(rels); m; m = relRe.exec(rels)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const paths: string[] = [];
  const sheetRe = /<sheet\b([^>]*?)\/?>/g;
  for (let m = sheetRe.exec(workbook); m; m = sheetRe.exec(workbook)) {
    const rid = attr(m[1], 'r:id');
    paths.push((rid && targets.get(rid)) || '');
  }
  return paths;
}

/** Estilos do arquivo; sem os bytes originais (arquivo montado em memória), tudo volta vazio. */
export function readWorkbookStyles(files: ZipFiles): WorkbookStyles {
  const stylesXml = text(files, 'xl/styles.xml');
  const theme = parseTheme(text(files, 'xl/theme/theme1.xml'));
  const fonts = parseFonts(stylesXml, theme);
  const fills = parseFills(stylesXml, theme);
  const borders = parseBorders(stylesXml, theme);
  const xfs = parseCellXfs(stylesXml);
  const paths = sheetPaths(files);
  const cache = new Map<number, CellFormat | undefined>();

  return {
    formatOf(styleIndex) {
      if (cache.has(styleIndex)) return cache.get(styleIndex);
      const xf = xfs[styleIndex];
      const format = xf ? toFormat(xf, fonts, fills, borders) : undefined;
      cache.set(styleIndex, format);
      return format;
    },
    cellStyles(sheetIndex) {
      const map = new Map<string, number>();
      const xml = text(files, paths[sheetIndex] ?? '');
      const re = /<c\b([^>]*?)\/?>/g;
      for (let m = re.exec(xml); m && map.size < MAX_STYLED_CELLS; m = re.exec(xml)) {
        const ref = attr(m[1], 'r');
        const s = attr(m[1], 's');
        if (!ref || !s || s === '0') continue;
        const cell = /^([A-Z]+)(\d+)$/.exec(ref);
        if (!cell) continue;
        let col = 0;
        for (const ch of cell[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
        map.set(`${Number(cell[2]) - 1},${col - 1}`, Number(s));
      }
      return map;
    },
    tabColor(sheetIndex) {
      const xml = text(files, paths[sheetIndex] ?? '');
      return resolveColor(colorTag(xml, 'tabColor'), theme);
    },
  };
}

/** Formato numérico do Excel (ex.: `#,##0.00`, `0%`, `"R$" #,##0.00`) para o tipo de formato do sistema. */
export function numberFormatOf(code: string | undefined): Pick<CellFormat, 'type' | 'decimals'> | undefined {
  if (!code || code === 'General' || code === '@') return undefined;
  const decimals = (/\.(0+)/.exec(code)?.[1] ?? '').length;
  let type: CellFormatType | undefined;
  if (code.includes('%')) type = 'percentage';
  else if (/R\$/.test(code)) type = 'currency';
  else if (/€/.test(code)) type = 'currency_eur';
  else if (/\$/.test(code)) type = 'currency_usd';
  else if (code.includes(',') || decimals > 0) type = 'number';
  return type ? { type, decimals } : undefined;
}
