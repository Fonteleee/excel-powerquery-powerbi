// src/features/relations/analysis/formulaLinks.ts
// Descobre, nas fórmulas das planilhas, as ligações entre tabelas (PROCX, PROCV, SOMASE, CONT.SE, MÉDIASE).
// Assim o que o usuário fez na aba de Dados aparece na aba de Relacionamentos, e muda junto quando a fórmula muda.
// Puro: só lê as planilhas.

import { Sheet } from '../../../types/spreadsheet';
import { RelationEdge, RelationFormulaType } from '../../../types/relations';
import { colIndexToLabel, labelToColIndex } from '../../../engine/formulaParser';

export type FormulaLinkFn = 'PROCX' | 'PROCV' | 'SOMASE' | 'CONT.SE' | 'MEDIASE';

export interface FormulaLink {
  /** Estável enquanto a fórmula não muda de planilha/coluna/função (serve de chave na interface). */
  id: string;
  fn: FormulaLinkFn;
  /** Planilha e coluna onde a fórmula está escrita. */
  sheetId: string;
  formulaCol: number;
  /** Coluna da própria planilha usada como chave. */
  keyCol: number;
  targetSheetId: string;
  targetKeyCol: number;
  /** Coluna de retorno na planilha de busca (nula em CONT.SE). */
  returnCol: number | null;
  /** Quantas células usam essa mesma ligação. */
  uses: number;
  /** Exemplo da fórmula (primeira encontrada). */
  example: string;
  exampleAddress: string;
}

const FN_ALIASES: Record<string, FormulaLinkFn> = {
  PROCX: 'PROCX',
  XLOOKUP: 'PROCX',
  PROCV: 'PROCV',
  VLOOKUP: 'PROCV',
  SOMASE: 'SOMASE',
  SUMIF: 'SOMASE',
  'CONT.SE': 'CONT.SE',
  COUNTIF: 'CONT.SE',
  MÉDIASE: 'MEDIASE',
  MEDIASE: 'MEDIASE',
  AVERAGEIF: 'MEDIASE',
};

export const FN_LABEL: Record<FormulaLinkFn, string> = {
  PROCX: 'PROCX',
  PROCV: 'PROCV',
  SOMASE: 'SOMASE',
  'CONT.SE': 'CONT.SE',
  MEDIASE: 'MÉDIASE',
};

const FN_PATTERN = /(PROCX|XLOOKUP|PROCV|VLOOKUP|SOMASE|SUMIF|CONT\.SE|COUNTIF|M[ÉE]DIASE|AVERAGEIF)\s*\(/i;
const MAX_CELLS_SCANNED = 200_000;

/** Argumentos de nível superior da chamada que começa em `open` (índice do "("). */
function splitArgs(text: string, open: number): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let quote = false;
  let current = '';
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) {
          args.push(current.trim());
          return args;
        }
        depth--;
      } else if ((ch === ';' || ch === ',') && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  return null;
}

interface RangeRef {
  sheetName: string | null;
  firstCol: number;
  lastCol: number;
}

/** "Pausas!A:C", "'Minha Aba'!$B$2:$B$900" ou "A:A" -> aba e colunas. */
function parseRangeRef(raw: string): RangeRef | null {
  const match = /^(?:(?:'((?:[^']|'')+)'|([^'!\s]+))!)?\$?([A-Za-z]{1,3})\$?\d*(?::\$?([A-Za-z]{1,3})\$?\d*)?$/.exec(raw.trim());
  if (!match) return null;
  const sheetName = match[1] !== undefined ? match[1].replace(/''/g, "'") : match[2] ?? null;
  const first = labelToColIndex(match[3].toUpperCase());
  const last = match[4] ? labelToColIndex(match[4].toUpperCase()) : first;
  return { sheetName, firstCol: Math.min(first, last), lastCol: Math.max(first, last) };
}

function parseKeyCol(raw: string): number | null {
  const match = /^\$?([A-Za-z]{1,3})\$?\d+$/.exec(raw.trim());
  return match ? labelToColIndex(match[1].toUpperCase()) : null;
}

interface ParsedFormula {
  fn: FormulaLinkFn;
  keyCol: number;
  target: RangeRef;
  returnCol: number | null;
}

function parseFormula(formula: string): ParsedFormula | null {
  const found = FN_PATTERN.exec(formula);
  if (!found) return null;
  const fn = FN_ALIASES[found[1].toUpperCase()];
  if (!fn) return null;
  const args = splitArgs(formula, found.index + found[0].length - 1);
  if (!args) return null;

  if (fn === 'PROCX') {
    if (args.length < 3) return null;
    const keyCol = parseKeyCol(args[0]);
    const lookup = parseRangeRef(args[1]);
    const ret = parseRangeRef(args[2]);
    if (keyCol === null || !lookup || !ret || !lookup.sheetName) return null;
    return { fn, keyCol, target: lookup, returnCol: ret.firstCol };
  }
  if (fn === 'PROCV') {
    if (args.length < 3) return null;
    const keyCol = parseKeyCol(args[0]);
    const table = parseRangeRef(args[1]);
    const index = Number(args[2]);
    if (keyCol === null || !table || !table.sheetName || !Number.isInteger(index) || index < 1) return null;
    return { fn, keyCol, target: { ...table, lastCol: table.firstCol }, returnCol: table.firstCol + index - 1 };
  }
  // SOMASE(intervalo_de_busca; critério; intervalo_de_soma), MÉDIASE idem, CONT.SE(intervalo; critério)
  if (args.length < 2) return null;
  const range = parseRangeRef(args[0]);
  const keyCol = parseKeyCol(args[1]);
  if (!range || keyCol === null || !range.sheetName) return null;
  if (fn === 'CONT.SE') return { fn, keyCol, target: range, returnCol: null };
  if (args.length < 3) return null;
  const sumRange = parseRangeRef(args[2]);
  if (!sumRange) return null;
  return { fn, keyCol, target: range, returnCol: sumRange.firstCol };
}

/** Ligações entre planilhas feitas por fórmulas. Chamadas dentro da mesma planilha não entram. */
export function detectFormulaLinks(sheets: readonly Sheet[]): FormulaLink[] {
  const byName = new Map(sheets.map(s => [s.name.toLowerCase(), s]));
  const links = new Map<string, FormulaLink>();
  let scanned = 0;

  for (const sheet of sheets) {
    for (const key of Object.keys(sheet.data)) {
      if (++scanned > MAX_CELLS_SCANNED) return [...links.values()];
      const cell = sheet.data[key];
      if (!cell.raw.startsWith('=')) continue;
      const parsed = parseFormula(cell.raw);
      if (!parsed) continue;
      const target = byName.get((parsed.target.sheetName ?? '').toLowerCase());
      if (!target || target.id === sheet.id) continue;
      const match = /^R(\d+)C(\d+)$/.exec(key);
      if (!match) continue;
      const formulaCol = Number(match[2]);
      const id = `${sheet.id}:${formulaCol}:${parsed.fn}:${target.id}:${parsed.target.firstCol}`;
      const existing = links.get(id);
      if (existing) {
        existing.uses++;
        continue;
      }
      links.set(id, {
        id,
        fn: parsed.fn,
        sheetId: sheet.id,
        formulaCol,
        keyCol: parsed.keyCol,
        targetSheetId: target.id,
        targetKeyCol: parsed.target.firstCol,
        returnCol: parsed.returnCol,
        uses: 1,
        example: cell.raw,
        exampleAddress: `${colIndexToLabel(formulaCol)}${Number(match[1]) + 1}`,
      });
    }
  }
  return [...links.values()].sort((a, b) => a.sheetId.localeCompare(b.sheetId) || a.formulaCol - b.formulaCol);
}

const TYPE_BY_FN: Record<FormulaLinkFn, RelationFormulaType> = {
  PROCX: 'PROCX',
  PROCV: 'PROCV',
  SOMASE: 'SOMASE',
  'CONT.SE': 'CONT.SE',
  MEDIASE: 'MEDIASE',
};

/** A mesma ligação no formato da migração das relações antigas, para reaproveitar a conversão em fluxo. */
export function linkToLegacyEdge(link: FormulaLink): RelationEdge {
  return {
    id: `formula-${link.id.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    sourceSheetId: link.sheetId,
    sourceColIdx: link.keyCol,
    targetSheetId: link.targetSheetId,
    targetColIdx: link.targetKeyCol,
    formulaType: TYPE_BY_FN[link.fn],
    returnColIdx: link.returnCol ?? link.targetKeyCol,
    outputDestination: 'new_sheet',
    createdAt: 0,
  };
}
