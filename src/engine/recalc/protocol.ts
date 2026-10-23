// src/engine/recalc/protocol.ts
// Contrato de mensagens entre a thread principal e o worker de recálculo (só dados clonáveis).

import { CellData, Sheet } from '../../types/spreadsheet';
import { FlowGraph } from '../../features/relations/model/graph';
import { CycleMessage } from './engine';

/** Edição de uma célula: `raw` vazio apaga a célula. */
export interface CellEdit {
  sheetId: string;
  row: number;
  col: number;
  raw: string;
}

/** Célula alterada pelo recálculo; `cell: null` = célula removida. */
export interface CellPatch {
  sheetId: string;
  key: string;
  cell: CellData | null;
}

export interface RecalcDelta {
  patches: CellPatch[];
  recalculated: number;
  cycles: CycleMessage[];
  elapsedMs: number;
}

export interface FlowEvaluateOptions {
  /** Máximo de linhas devolvidas por nó (padrão 200). */
  rowLimit?: number;
}

export interface FlowNodeSummary {
  error: string | null;
  rootCause?: string;
  headers: string[];
  totalRows: number;
  rows: Record<string, string | number | boolean | null | undefined>[];
}

export interface FlowEvaluation {
  nodes: Record<string, FlowNodeSummary>;
  /** Nós realmente reavaliados nesta chamada (os demais vieram do cache do worker). */
  evaluated: string[];
}

export interface RecalcApi {
  ping(): string;
  /** Carrega as abas (clone), monta o grafo e calcula tudo. Devolve os valores calculados. */
  init(sheets: Sheet[]): RecalcDelta;
  /** Aplica edições e recalcula só o ramo afetado. */
  applyEdits(edits: CellEdit[]): RecalcDelta;
  /** Troca uma aba inteira (mudança estrutural) e recalcula tudo. */
  replaceSheet(sheet: Sheet): RecalcDelta;
  /** Avalia o grafo de relacionamentos, reaproveitando nós não afetados desde a última chamada. */
  evaluateFlow(graph: FlowGraph, options?: FlowEvaluateOptions): FlowEvaluation;
}

/** Versão assíncrona (o que o cliente expõe, com worker ou sem). */
export type AsyncRecalcApi = {
  [K in keyof RecalcApi]: (...args: Parameters<RecalcApi[K]>) => Promise<ReturnType<RecalcApi[K]>>;
};

/** Aplica patches numa aba sem mutar a original (copy-on-write do mapa de células). */
export function applyPatches(sheet: Sheet, patches: readonly CellPatch[]): Sheet {
  const mine = patches.filter(p => p.sheetId === sheet.id);
  if (mine.length === 0) return sheet;
  const data = { ...sheet.data };
  for (const p of mine) {
    if (p.cell === null) delete data[p.key];
    else data[p.key] = p.cell;
  }
  return { ...sheet, data };
}
