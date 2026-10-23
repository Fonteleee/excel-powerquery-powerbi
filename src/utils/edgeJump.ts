// src/utils/edgeJump.ts
// Ctrl+setas e Ctrl+Shift+setas no estilo do Excel (funções puras).

import { CellPosition, CellRange } from '../types/spreadsheet';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface EdgeJumpInput {
  anchor: CellPosition;
  /** Célula ativa (o canto que se move). */
  focus: CellPosition;
  direction: Direction;
  /** Ctrl+Shift: estende a seleção a partir de `anchor`. */
  extend: boolean;
  rowCount: number;
  colCount: number;
  isFilled: (row: number, col: number) => boolean;
}

export interface EdgeJumpResult {
  active: CellPosition;
  anchor: CellPosition;
  range: CellRange;
}

/**
 * Regra do Excel ao longo de uma linha/coluna: se a célula atual e a seguinte estão preenchidas, vai até
 * o fim do bloco; caso contrário, vai até a próxima célula preenchida; sem nenhuma, vai até a borda.
 */
export function jumpIndex(start: number, step: 1 | -1, limit: number, filledAt: (i: number) => boolean): number {
  const last = step === 1 ? limit - 1 : 0;
  if (start === last) return start;
  let i = start + step;
  if (filledAt(start) && filledAt(i)) {
    while (i !== last && filledAt(i + step)) i += step;
    return i;
  }
  while (i !== last && !filledAt(i)) i += step;
  return i;
}

export function computeEdgeJump(input: EdgeJumpInput): EdgeJumpResult {
  const { focus, direction, rowCount, colCount, isFilled } = input;
  const vertical = direction === 'up' || direction === 'down';
  const step: 1 | -1 = direction === 'down' || direction === 'right' ? 1 : -1;
  const active: CellPosition = vertical
    ? { row: jumpIndex(focus.row, step, rowCount, r => isFilled(r, focus.col)), col: focus.col }
    : { row: focus.row, col: jumpIndex(focus.col, step, colCount, c => isFilled(focus.row, c)) };

  const anchor = input.extend ? input.anchor : active;
  return {
    active,
    anchor,
    range: {
      startRow: Math.min(anchor.row, active.row),
      endRow: Math.max(anchor.row, active.row),
      startCol: Math.min(anchor.col, active.col),
      endCol: Math.max(anchor.col, active.col),
    },
  };
}
