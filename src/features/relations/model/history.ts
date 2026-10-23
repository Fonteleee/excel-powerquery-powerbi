// src/features/relations/model/history.ts
// Histórico de desfazer/refazer do FlowGraph. Puro e imutável: cada operação devolve um novo histórico.
// Independente do histórico das planilhas do App. Edições contínuas (arrastar um nó, digitar um parâmetro)
// podem ser agrupadas por `coalesceKey` numa janela de tempo para virar um único passo.

import { FlowGraph } from './graph';

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 800;

export interface GraphHistory {
  past: readonly FlowGraph[];
  future: readonly FlowGraph[];
  lastKey: string | null;
  lastAt: number;
}

export const createHistory = (): GraphHistory => ({ past: [], future: [], lastKey: null, lastAt: 0 });

export const canUndo = (h: GraphHistory): boolean => h.past.length > 0;
export const canRedo = (h: GraphHistory): boolean => h.future.length > 0;

/** Registra `previous` (estado ANTES de uma edição) e zera o "refazer". */
export function recordEdit(
  h: GraphHistory,
  previous: FlowGraph,
  options: { coalesceKey?: string; now?: number; limit?: number } = {}
): GraphHistory {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, options.limit ?? HISTORY_LIMIT);
  const key = options.coalesceKey ?? null;
  if (key !== null && h.lastKey === key && now - h.lastAt <= COALESCE_WINDOW_MS && h.past.length > 0) {
    // Continuação da mesma edição: mantém o estado inicial já guardado.
    return { ...h, future: [], lastAt: now };
  }
  const past = [...h.past, previous];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [], lastKey: key, lastAt: now };
}

export interface HistoryStep {
  history: GraphHistory;
  graph: FlowGraph;
}

export function undo(h: GraphHistory, current: FlowGraph): HistoryStep | null {
  if (h.past.length === 0) return null;
  const graph = h.past[h.past.length - 1];
  return { graph, history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null, lastAt: 0 } };
}

export function redo(h: GraphHistory, current: FlowGraph): HistoryStep | null {
  if (h.future.length === 0) return null;
  const [graph, ...rest] = h.future;
  return { graph, history: { past: [...h.past, current], future: rest, lastKey: null, lastAt: 0 } };
}
