// src/engine/formulas/addressing.ts
// Endereçamento de células: A1 <-> índices, chaves "R{row}C{col}" e deslocamento de fórmulas.

import { CellPosition, CellRange } from '../../types/spreadsheet';

// Converts 0 -> 'A', 1 -> 'B', 25 -> 'Z', 26 -> 'AA', etc.
export function colIndexToLabel(colIndex: number): string {
  let label = '';
  let temp = colIndex;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

// Converts 'A' -> 0, 'B' -> 1, 'AA' -> 26
export function labelToColIndex(label: string): number {
  let col = 0;
  const upper = label.toUpperCase().trim();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

// Parse "A1" -> { row: 0, col: 0 }
export function parseCellAddress(address: string): CellPosition | null {
  const match = address.trim().toUpperCase().match(/^(\$?)([A-Z]+)(\$?)([0-9]+)$/);
  if (!match) return null;
  const col = labelToColIndex(match[2]);
  const row = parseInt(match[4], 10) - 1;
  if (isNaN(row) || col < 0) return null;
  return { row, col };
}

// Parse "A1:B10" or "A:A"
export function parseRangeAddress(rangeStr: string, maxRows = 100): CellRange | null {
  const parts = rangeStr.trim().toUpperCase().split(':');
  if (parts.length === 1) {
    const single = parseCellAddress(parts[0]);
    if (!single) return null;
    return { startRow: single.row, startCol: single.col, endRow: single.row, endCol: single.col };
  }
  if (parts.length === 2) {
    // Check if whole columns like "A:B", "A:A", "$A:$A", "$B:$B"
    const c1Str = parts[0].replace(/\$/g, '');
    const c2Str = parts[1].replace(/\$/g, '');
    const colOnlyMatch1 = c1Str.match(/^[A-Z]+$/);
    const colOnlyMatch2 = c2Str.match(/^[A-Z]+$/);
    if (colOnlyMatch1 && colOnlyMatch2) {
      const c1 = labelToColIndex(c1Str);
      const c2 = labelToColIndex(c2Str);
      return {
        startRow: 0,
        startCol: Math.min(c1, c2),
        endRow: maxRows - 1,
        endCol: Math.max(c1, c2),
      };
    }

    const p1 = parseCellAddress(parts[0]);
    const p2 = parseCellAddress(parts[1]);
    if (!p1 || !p2) return null;
    return {
      startRow: Math.min(p1.row, p2.row),
      startCol: Math.min(p1.col, p2.col),
      endRow: Math.max(p1.row, p2.row),
      endCol: Math.max(p1.col, p2.col),
    };
  }
  return null;
}

export function cellPosToKey(row: number, col: number): string {
  return `R${row}C${col}`;
}

export function keyToCellPos(key: string): CellPosition {
  const match = key.match(/^R(\d+)C(\d+)$/);
  if (match) {
    return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
  }
  const addr = parseCellAddress(key);
  return addr || { row: 0, col: 0 };
}

export function cellPosToAddress(pos: CellPosition): string {
  return `${colIndexToLabel(pos.col)}${pos.row + 1}`;
}

export function rangeToAddress(range: CellRange): string {
  const p1 = `${colIndexToLabel(range.startCol)}${range.startRow + 1}`;
  const p2 = `${colIndexToLabel(range.endCol)}${range.endRow + 1}`;
  if (p1 === p2) return p1;
  return `${p1}:${p2}`;
}

/**
 * Accurately shifts relative cell and range references in a formula by deltaRow and deltaCol.
 * Preserves absolute reference anchors ($) on columns and/or rows (e.g. $A$1, $A1, A$1).
 */
export function shiftFormula(formula: string, deltaRow: number, deltaCol: number): string {
  if (!formula || !formula.startsWith('=')) return formula;
  if (deltaRow === 0 && deltaCol === 0) return formula;

  // Match cell coordinates with optional sheet prefix and $ anchors
  const refRegex = /(?:([A-Za-z0-9_ÁÉÍÓÚÂÊÔÃÕÇ]+)!)?(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;

  return formula.replace(refRegex, (match, sheetPrefix, colDollar, colLetters, rowDollar, rowNumber) => {
    let newColLetters = colLetters;
    if (!colDollar && deltaCol !== 0) {
      const curColIdx = labelToColIndex(colLetters);
      const newColIdx = Math.max(0, curColIdx + deltaCol);
      newColLetters = colIndexToLabel(newColIdx);
    }

    let newRowNum = parseInt(rowNumber, 10);
    if (!rowDollar && deltaRow !== 0) {
      newRowNum = Math.max(1, newRowNum + deltaRow);
    }

    const prefix = sheetPrefix ? `${sheetPrefix}!` : '';
    return `${prefix}${colDollar}${newColLetters}${rowDollar}${newRowNum}`;
  });
}
