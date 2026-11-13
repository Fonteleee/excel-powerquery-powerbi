// src/components/Grid/freeze.ts
// Congelar linhas/colunas e agrupar (estrutura de tópicos): contas puras usadas pela grade.

import { Sheet } from '../../types/spreadsheet';
import { ColWindow } from './colWindow';

export const ROW_NUMBER_WIDTH = 40;
export const HEADER_HEIGHT = 32;
export const FALLBACK_ROW_HEIGHT = 28;

export interface FrozenLayout {
  /** Colunas congeladas que ficaram fora da janela virtual: são desenhadas à esquerda mesmo assim. */
  extraCols: number[];
  /** Posição (px) em que a linha fica fixa; undefined se a linha não é congelada. */
  rowTop: (row: number) => number | undefined;
  /** Posição (px) em que a coluna fica fixa; undefined se a coluna não é congelada. */
  colLeft: (col: number) => number | undefined;
}

export function frozenLayout(
  sheet: Pick<Sheet, 'frozenRows' | 'frozenCols' | 'hiddenRows' | 'hiddenCols'>,
  colOffsets: Float64Array,
  colWindow: ColWindow,
  /** Altura real (medida) das linhas congeladas, na ordem em que aparecem. */
  measuredRowHeights: readonly number[] = []
): FrozenLayout {
  const rows = Math.max(0, sheet.frozenRows ?? 0);
  const cols = Math.min(Math.max(0, sheet.frozenCols ?? 0), colOffsets.length - 1);
  const hiddenRows = new Set(sheet.hiddenRows);
  const hiddenCols = new Set(sheet.hiddenCols);

  const tops = new Map<number, number>();
  let y = HEADER_HEIGHT;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    if (hiddenRows.has(r) && r > 0) continue;
    tops.set(r, y);
    y += measuredRowHeights[n++] || FALLBACK_ROW_HEIGHT;
  }

  const extraCols: number[] = [];
  for (let c = 0; c < cols && c < colWindow.start; c++) if (!hiddenCols.has(c)) extraCols.push(c);

  return {
    extraCols,
    rowTop: row => tops.get(row),
    colLeft: col => (col < cols && !hiddenCols.has(col) ? ROW_NUMBER_WIDTH + colOffsets[col] : undefined),
  };
}

/** A janela virtual sem as colunas congeladas desenhadas à parte (o espaçador encolhe pela largura delas). */
export function windowWithoutFrozen(colWindow: ColWindow, colOffsets: Float64Array, extraCols: readonly number[]): ColWindow {
  const used = extraCols.reduce((sum, c) => sum + (colOffsets[c + 1] - colOffsets[c]), 0);
  return { ...colWindow, leftPx: Math.max(0, colWindow.leftPx - used) };
}

// ---------- Agrupamento (estrutura de tópicos) ----------

type Levels = { [index: number]: number } | undefined;

const level = (levels: Levels, i: number): number => (i >= 0 && levels ? levels[i] ?? 0 : 0);

/**
 * Onde fica o botão +/−: no Excel, por padrão, na linha/coluna logo DEPOIS do grupo (ou ANTES, se o resumo fica acima).
 * Devolve a lista de itens do grupo que o botão em `at` controla (vazia se `at` não tem botão).
 */
export function groupMembers(levels: Levels, at: number, summaryAbove: boolean, count: number): number[] {
  const step = summaryAbove ? 1 : -1;
  const own = level(levels, at);
  const members: number[] = [];
  // O botão só existe se o vizinho (do lado do grupo) tem nível mais alto que o próprio item.
  for (let i = at + step; i >= 0 && i < count && level(levels, i) > own; i += step) members.push(i);
  return members;
}

/** Itens (linhas ou colunas) que têm botão, e o grupo de cada um recolhido ou não. */
export function groupToggles(levels: Levels, hidden: readonly number[] | undefined, summaryAbove: boolean, count: number, within: readonly number[]): Map<number, boolean> {
  const out = new Map<number, boolean>();
  if (!levels) return out;
  const hiddenSet = new Set(hidden);
  for (const at of within) {
    const members = groupMembers(levels, at, summaryAbove, count);
    if (members.length > 0) out.set(at, members.every(m => hiddenSet.has(m)));
  }
  return out;
}

/** Recolhe (oculta) ou expande o grupo controlado por `at`; devolve a nova lista de ocultos. */
export function toggleGroup(levels: Levels, hidden: readonly number[] | undefined, at: number, summaryAbove: boolean, count: number): number[] {
  const members = groupMembers(levels, at, summaryAbove, count);
  const set = new Set(hidden);
  const collapsed = members.length > 0 && members.every(m => set.has(m));
  for (const m of members) {
    if (collapsed) set.delete(m);
    else set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}
