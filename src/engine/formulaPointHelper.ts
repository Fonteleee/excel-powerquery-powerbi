import { CellPosition, CellRange, FormulaParamGuide } from '../types/spreadsheet';
import {
  cellPosToAddress,
  rangeToAddress,
  parseCellAddress,
  parseRangeAddress,
  colIndexToLabel,
  FORMULA_CATALOG,
} from './formulaParser';

export const FORMULA_COLOR_PALETTE = [
  '#2563eb', // Blue (Param 1)
  '#e11d48', // Rose / Red (Param 2)
  '#9333ea', // Purple (Param 3)
  '#d97706', // Amber / Orange (Param 4)
  '#059669', // Emerald (Param 5)
  '#0891b2', // Cyan (Param 6)
];

export interface FormulaReferenceHighlight {
  address: string;
  range: CellRange;
  color: string;
  bgColor: string;
}

/**
 * Parses all cell and range references in a formula and assigns distinct visual colors
 */
export function extractReferencesFromFormula(formula: string): FormulaReferenceHighlight[] {
  if (!formula || !formula.startsWith('=')) return [];

  // Match cell and range tokens e.g. A1, B2:B10, $C$4, $D$2:$D$20
  const refRegex = /\b(\$?[A-Za-z]+\$?[0-9]+(?::\$?[A-Za-z]+\$?[0-9]+)?)\b/g;
  const matches = [...formula.matchAll(refRegex)];
  const result: FormulaReferenceHighlight[] = [];

  matches.forEach((m, idx) => {
    const rawAddr = m[1];
    let range: CellRange | null = null;
    if (rawAddr.includes(':')) {
      range = parseRangeAddress(rawAddr);
    } else {
      const pos = parseCellAddress(rawAddr);
      if (pos) {
        range = { startRow: pos.row, startCol: pos.col, endRow: pos.row, endCol: pos.col };
      }
    }

    if (range) {
      const color = FORMULA_COLOR_PALETTE[idx % FORMULA_COLOR_PALETTE.length];
      result.push({
        address: rawAddr,
        range,
        color,
        bgColor: `${color}18`,
      });
    }
  });

  return result;
}

/**
 * Inserts or updates a cell/range reference in the current formula during Pointing Mode (Mouse Click/Drag)
 */
export function insertOrUpdateReferenceInFormula(
  currentFormula: string,
  newAddress: string,
  isReplacingCurrentPoint: boolean
): string {
  if (!currentFormula) {
    return `=${newAddress}`;
  }

  let formula = currentFormula;
  if (!formula.startsWith('=')) {
    formula = `=${formula}`;
  }

  // If user typed '=PROCX' or '=SOMA' without opening parenthesis, auto-add '('
  if (/^=[A-ZÀ-Úa-z0-9._]+$/i.test(formula.trim())) {
    return `${formula.trim()}(${newAddress}`;
  }

  // If replacing during an ongoing drag interaction (e.g. dragged from B2 to B10)
  if (isReplacingCurrentPoint) {
    const trailingRefRegex = /([A-Za-z0-9_]+!)?\$?[A-Za-z]+\$?[0-9]+(?::\$?[A-Za-z]+\$?[0-9]+)?\s*$/;
    if (trailingRefRegex.test(formula)) {
      return formula.replace(trailingRefRegex, newAddress);
    }
  }

  // If formula ends with open paren '(', operator, or argument separator (';', ',')
  const endsWithOperatorOrSeparator = /[(=+\-*/^&;,<>]\s*$/;
  if (endsWithOperatorOrSeparator.test(formula)) {
    const separatorMatch = formula.match(/([;,]\s*)$/);
    if (separatorMatch) {
      return `${formula.trimEnd()} ${newAddress}`;
    }
    return `${formula}${newAddress}`;
  }

  // Otherwise, default to adding argument separator
  return `${formula}; ${newAddress}`;
}

export interface ActiveFunctionInfo {
  funcName: string;
  guide?: FormulaParamGuide;
  activeParamIndex: number;
  openParenCount: number;
}

/**
 * Detects the currently active function and active parameter index in a formula string
 */
export function parseActiveFunctionAndParam(formula: string): ActiveFunctionInfo | null {
  if (!formula || !formula.startsWith('=')) return null;

  const text = formula.substring(1);
  let parenDepth = 0;
  let inQuote = false;
  let lastOpenParenIndex = -1;
  let paramIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;

    if (ch === '(') {
      parenDepth++;
      lastOpenParenIndex = i;
      paramIndex = 0;
    } else if (ch === ')') {
      parenDepth--;
      lastOpenParenIndex = -1;
    } else if ((ch === ';' || ch === ',') && parenDepth > 0) {
      paramIndex++;
    }
  }

  if (parenDepth <= 0 || lastOpenParenIndex === -1) {
    return null;
  }

  const beforeParen = text.substring(0, lastOpenParenIndex);
  const funcMatch = beforeParen.match(/([A-ZÀ-Úa-z0-9._]+)$/);
  if (!funcMatch) return null;

  const funcName = funcMatch[1].toUpperCase();
  const guide = FORMULA_CATALOG.find(
    f => f.name.toUpperCase() === funcName || f.name.replace(/\./g, '').toUpperCase() === funcName.replace(/\./g, '')
  );

  return {
    funcName,
    guide,
    activeParamIndex: paramIndex,
    openParenCount: parenDepth,
  };
}
