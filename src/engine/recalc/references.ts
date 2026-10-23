// src/engine/recalc/references.ts
// Extração das referências de uma fórmula (células, intervalos, colunas inteiras, outras abas).
// É uma varredura textual conservadora: pode incluir uma referência a mais (inofensivo), mas não
// deve deixar de fora nenhuma célula que o avaliador consiga ler. Textos entre aspas são ignorados.

import { Sheet } from '../../types/spreadsheet';
import { parseCellAddress, parseRangeAddress } from '../formulas/addressing';
import { findSheetByReferenceName } from '../formulas/evaluator';

/** Fim de intervalo para colunas inteiras ("A:A"): vale para qualquer linha, mesmo a futuras. */
export const WHOLE_COLUMN_END_ROW = Number.MAX_SAFE_INTEGER;

export interface CellRef {
  sheetId: string;
  row: number;
  col: number;
}

export interface RangeRef {
  sheetId: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface FormulaRefs {
  cells: CellRef[];
  ranges: RangeRef[];
  /** Depende do relógio (HOJE/AGORA): precisa ser recalculada a cada rodada. */
  volatile: boolean;
}

/** Resolve o nome de aba citado numa fórmula para os ids de aba possíveis. */
export class SheetNameIndex {
  private readonly cache = new Map<string, string[]>();

  constructor(private readonly sheets: readonly Sheet[]) {}

  /** `null` = a própria aba da fórmula. O avaliador cai na aba atual quando o nome não existe. */
  resolve(name: string | null, currentSheetId: string): string[] {
    if (name === null) return [currentSheetId];
    const cached = this.cache.get(name);
    if (cached) return cached;

    const ids = new Set<string>();
    const mutable = this.sheets as Sheet[];
    // Regra de resolveRangeAndValues (intervalos)
    const byRange = findSheetByReferenceName(name, mutable);
    if (byRange) ids.add(byRange.id);
    // Regra da referência simples (Aba!A1): comparação por maiúsculas e prefixo.
    const clean = name.toUpperCase().replace(/\.+$/, '');
    const bySimple = this.sheets.find(s => {
      const sName = s.name.toUpperCase();
      return sName === name.toUpperCase() || sName.startsWith(clean) || clean.startsWith(sName);
    });
    if (bySimple) ids.add(bySimple.id);
    if (ids.size === 0) ids.add(currentSheetId);

    const resolved = [...ids];
    this.cache.set(name, resolved);
    return resolved;
  }
}

const SHEET = String.raw`(?:'((?:[^']|'')+)'|([\p{L}\p{N}_.]+))!`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?\d+`;
const COLUMN = String.raw`\$?[A-Za-z]{1,3}`;
const BEFORE = String.raw`(?<![\p{L}\p{N}_$.'])`;

const CELL_OR_RANGE = new RegExp(String.raw`${BEFORE}(?:${SHEET})?(${CELL})(?::(${CELL}))?(?![\p{L}\p{N}_(])`, 'gu');
const COLUMN_RANGE = new RegExp(String.raw`${BEFORE}(?:${SHEET})?(${COLUMN}):(${COLUMN})(?![\p{L}\p{N}_($])`, 'gu');
const VOLATILE = /(?<![\p{L}\p{N}_.])(HOJE|TODAY|AGORA|NOW)\s*\(/iu;

/** Troca o conteúdo de textos entre aspas por espaços (referências dentro de texto não contam). */
function blankStrings(formula: string): string {
  return formula.replace(/"(?:[^"]|"")*"/g, m => ' '.repeat(m.length));
}

function sheetNameOf(quoted: string | undefined, bare: string | undefined): string | null {
  if (quoted !== undefined) return quoted.replace(/''/g, "'").trim();
  if (bare !== undefined) return bare.trim();
  return null;
}

export function extractReferences(formula: string, currentSheetId: string, names: SheetNameIndex): FormulaRefs {
  const refs: FormulaRefs = { cells: [], ranges: [], volatile: false };
  if (!formula.startsWith('=')) return refs;

  const text = blankStrings(formula);
  refs.volatile = VOLATILE.test(text);

  for (const m of text.matchAll(CELL_OR_RANGE)) {
    const sheetIds = names.resolve(sheetNameOf(m[1], m[2]), currentSheetId);
    const first = parseCellAddress(m[3]);
    if (!first) continue;
    const second = m[4] ? parseCellAddress(m[4]) : null;
    for (const sheetId of sheetIds) {
      if (!second || (second.row === first.row && second.col === first.col)) {
        refs.cells.push({ sheetId, row: first.row, col: first.col });
      } else {
        refs.ranges.push({
          sheetId,
          startRow: Math.min(first.row, second.row),
          startCol: Math.min(first.col, second.col),
          endRow: Math.max(first.row, second.row),
          endCol: Math.max(first.col, second.col),
        });
      }
    }
  }

  for (const m of text.matchAll(COLUMN_RANGE)) {
    const sheetIds = names.resolve(sheetNameOf(m[1], m[2]), currentSheetId);
    const range = parseRangeAddress(`${m[3]}:${m[4]}`, 1);
    if (!range) continue;
    for (const sheetId of sheetIds) {
      refs.ranges.push({
        sheetId,
        startRow: 0,
        startCol: range.startCol,
        endRow: WHOLE_COLUMN_END_ROW,
        endCol: range.endCol,
      });
    }
  }
  return refs;
}
