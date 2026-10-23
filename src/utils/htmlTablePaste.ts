// src/utils/htmlTablePaste.ts
// Colar HTML (text/html) como tabela. Decisão de segurança: o HTML NUNCA vira DOM (nem DOMParser, nem
// innerHTML): um tokenizador próprio lê só <table>/<tr>/<td>/<th> e atributos simples; scripts, estilos,
// comentários e qualquer outra tag são descartados, nada é executado nem carregado.

import { CellData, MergedRegion } from '../types/spreadsheet';
import { cellPosToKey } from '../engine/formulaParser';

export const MAX_PASTE_ROWS = 5000;
export const MAX_PASTE_COLS = 200;

export interface HtmlCell {
  row: number;
  col: number;
  text: string;
  bold?: boolean;
  bgColor?: string;
  textColor?: string;
}

export interface HtmlMerge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface HtmlTable {
  cells: HtmlCell[];
  merges: HtmlMerge[];
  rowCount: number;
  colCount: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

/** Aceita só cores seguras (#hex, rgb()/rgba()); devolve #rrggbb ou undefined. */
export function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1];
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return undefined;
    const to = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, '0');
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`;
  }
  return undefined;
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : undefined;
}

function styleProp(style: string | undefined, prop: string): string | undefined {
  if (!style) return undefined;
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i > 0 && part.slice(0, i).trim().toLowerCase() === prop) return part.slice(i + 1).trim();
  }
  return undefined;
}

const spanOf = (value: string | undefined, max: number): number => {
  const n = value ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 1 ? Math.min(n, max) : 1;
};

/** Lê a primeira tabela do HTML. Devolve null se não houver tabela. */
export function parseHtmlTable(html: string): HtmlTable | null {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|template|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '');
  const start = /<table\b/i.exec(clean);
  if (!start) return null;

  const token = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;
  token.lastIndex = start.index;

  const occupied = new Set<string>();
  const cells: HtmlCell[] = [];
  const merges: HtmlMerge[] = [];
  let depth = 0;
  let row = -1;
  let col = 0;
  let current: { text: string; attrs: string; header: boolean; rowSpan: number; colSpan: number } | null = null;
  let rowCount = 0;
  let colCount = 0;

  const closeCell = (): void => {
    if (!current || row < 0) return;
    while (occupied.has(`${row},${col}`)) col++;
    const text = current.text.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    if (row < MAX_PASTE_ROWS && col < MAX_PASTE_COLS) {
      const style = attr(current.attrs, 'style');
      const weight = styleProp(style, 'font-weight');
      const cell: HtmlCell = { row, col, text: text.startsWith('=') ? `'${text}` : text };
      if (current.header || (weight && (weight === 'bold' || Number(weight) >= 600))) cell.bold = true;
      const bg = safeColor(styleProp(style, 'background-color') ?? styleProp(style, 'background') ?? attr(current.attrs, 'bgcolor'));
      if (bg) cell.bgColor = bg;
      const fg = safeColor(styleProp(style, 'color'));
      if (fg) cell.textColor = fg;
      cells.push(cell);
      if (current.rowSpan > 1 || current.colSpan > 1) {
        merges.push({ row, col, rowSpan: current.rowSpan, colSpan: current.colSpan });
      }
      for (let r = 0; r < current.rowSpan; r++) {
        for (let c = 0; c < current.colSpan; c++) occupied.add(`${row + r},${col + c}`);
      }
      rowCount = Math.max(rowCount, row + current.rowSpan);
      colCount = Math.max(colCount, col + current.colSpan);
    }
    col += current.colSpan;
    current = null;
  };

  let m: RegExpExecArray | null;
  while ((m = token.exec(clean)) !== null) {
    if (m[4] !== undefined) {
      if (current && depth === 1) current.text += decodeEntities(m[4]);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'table') {
      if (closing) {
        depth--;
        if (depth === 0) {
          closeCell();
          break;
        }
      } else depth++;
      continue;
    }
    if (depth !== 1) continue; // tabelas aninhadas: ignoradas
    if (tag === 'tr') {
      closeCell();
      if (!closing) {
        row++;
        col = 0;
      }
    } else if (tag === 'td' || tag === 'th') {
      closeCell();
      if (!closing) {
        if (row < 0) row = 0;
        current = {
          text: '',
          attrs: m[3],
          header: tag === 'th',
          rowSpan: spanOf(attr(m[3], 'rowspan'), MAX_PASTE_ROWS),
          colSpan: spanOf(attr(m[3], 'colspan'), MAX_PASTE_COLS),
        };
      }
    } else if (tag === 'br' && current) {
      current.text += '\n';
    } else if ((tag === 'p' || tag === 'div') && current && closing) {
      current.text += '\n';
    }
  }
  closeCell();

  return cells.length > 0 ? { cells, merges, rowCount, colCount } : null;
}

export interface HtmlPasteResult {
  data: Record<string, CellData>;
  mergedRegions: MergedRegion[];
  /** Maior linha/coluna escrita, para o chamador expandir a aba se precisar. */
  lastRow: number;
  lastCol: number;
}

/** Aplica a tabela em `data` a partir de (originRow, originCol), sem alterar o objeto original. */
export function applyHtmlTable(
  data: Record<string, CellData>,
  table: HtmlTable,
  originRow: number,
  originCol: number,
  bounds: { rowCount: number; colCount: number },
  existingMerges: MergedRegion[] = []
): HtmlPasteResult {
  const next = { ...data };
  let lastRow = originRow;
  let lastCol = originCol;
  for (const c of table.cells) {
    const r = originRow + c.row;
    const k = originCol + c.col;
    if (r >= bounds.rowCount || k >= bounds.colCount) continue;
    const key = cellPosToKey(r, k);
    const format = { ...next[key]?.format };
    if (c.bold) format.bold = true;
    if (c.bgColor) format.bgColor = c.bgColor;
    if (c.textColor) format.textColor = c.textColor;
    next[key] = {
      raw: c.text,
      value: c.text,
      ...(Object.keys(format).length > 0 ? { format } : {}),
    };
    lastRow = Math.max(lastRow, r);
    lastCol = Math.max(lastCol, k);
  }

  const mergedRegions = [...existingMerges];
  for (const m of table.merges) {
    const startRow = originRow + m.row;
    const startCol = originCol + m.col;
    const endRow = Math.min(bounds.rowCount - 1, startRow + m.rowSpan - 1);
    const endCol = Math.min(bounds.colCount - 1, startCol + m.colSpan - 1);
    if (startRow >= bounds.rowCount || startCol >= bounds.colCount) continue;
    const overlaps = (x: MergedRegion) =>
      !(x.endRow < startRow || x.startRow > endRow || x.endCol < startCol || x.startCol > endCol);
    const kept = mergedRegions.filter(x => !overlaps(x));
    kept.push({ id: `paste-${startRow}-${startCol}`, startRow, startCol, endRow, endCol });
    mergedRegions.length = 0;
    mergedRegions.push(...kept);
  }
  return { data: next, mergedRegions, lastRow, lastCol };
}
