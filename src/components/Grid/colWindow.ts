// src/components/Grid/colWindow.ts
// Janela de colunas visíveis: planilhas com milhares de colunas (até XFD, como no Excel) só desenham
// as que cabem na tela, mais uma folga; o resto vira um espaçador com a largura certa.

export const DEFAULT_COL_WIDTH = 120;
/** Abaixo disso todas as colunas são desenhadas (o custo é pequeno e nada muda para tabelas comuns). */
export const VIRTUALIZE_FROM_COLS = 60;

export interface ColWindow {
  start: number;
  end: number;
  /** Largura em px das colunas antes de `start` e depois de `end`. */
  leftPx: number;
  rightPx: number;
}

/** off[c] = posição (px) onde a coluna c começa; off[colCount] = largura total. Colunas ocultas têm largura 0. */
export function columnOffsets(colCount: number, colWidths: { [col: number]: number }, hiddenCols?: readonly number[]): Float64Array {
  const hidden = new Set(hiddenCols);
  const off = new Float64Array(colCount + 1);
  for (let c = 0; c < colCount; c++) off[c + 1] = off[c] + (hidden.has(c) ? 0 : colWidths[c] || DEFAULT_COL_WIDTH);
  return off;
}

/** Primeira coluna cujo fim está depois de `x`. */
function firstEndingAfter(off: Float64Array, x: number): number {
  let lo = 0;
  let hi = off.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (off[mid + 1] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function computeColWindow(off: Float64Array, scrollLeft: number, viewportWidth: number): ColWindow {
  const colCount = off.length - 1;
  if (colCount <= VIRTUALIZE_FROM_COLS) return { start: 0, end: colCount - 1, leftPx: 0, rightPx: 0 };
  // Folga de meia tela à esquerda e uma à direita: rolar não mostra buracos e a grade continua leve.
  const from = Math.max(0, scrollLeft - viewportWidth * 0.5);
  const to = scrollLeft + viewportWidth * 2;
  const start = firstEndingAfter(off, from);
  const end = Math.min(colCount - 1, Math.max(start, firstEndingAfter(off, to)));
  return { start, end, leftPx: off[start], rightPx: off[colCount] - off[end + 1] };
}
