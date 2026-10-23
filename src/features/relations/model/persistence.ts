// src/features/relations/model/persistence.ts
// Persistência do grafo e do estado de visualização. Tudo que volta do armazenamento passa pelo validador.
//
// Decisão: o grafo continua em localStorage (e não em IndexedDB). Ele é pequeno (limite de 2 MB aqui,
// 500 nós / 2000 arestas no schema), contém só metadados (os dados ficam nas planilhas, que já usam
// IndexedDB) e precisa ser lido de forma SÍNCRONA na montagem da aba, sem tela vazia piscando.
// Se o conteúdo guardado for inválido, uma cópia vai para a chave de backup antes de qualquer
// sobrescrita, então um schema novo nunca apaga o trabalho do usuário em silêncio.

import { createEmptyGraph, FlowGraph } from './graph';
import { parseFlowGraph } from './schema';
import { createDefaultViewState, FlowViewState, parseViewState } from './viewState';

export const FLOW_GRAPH_STORAGE_KEY = 'nocodb_flow_graph_v1';
export const FLOW_GRAPH_BACKUP_KEY = 'nocodb_flow_graph_v1_invalid_backup';
export const FLOW_VIEW_STORAGE_KEY = 'nocodb_flow_view_v1';
const MAX_STORED_BYTES = 2_000_000;

/** Subconjunto de `Storage` usado aqui (permite testar sem navegador). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveFlowGraph(graph: FlowGraph, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(FLOW_GRAPH_STORAGE_KEY, JSON.stringify(graph));
  } catch {
    // quota excedida ou storage indisponível: o grafo continua válido em memória
  }
}

function backupInvalid(raw: string, storage: StorageLike): void {
  try {
    if (storage.getItem(FLOW_GRAPH_BACKUP_KEY) === null && raw.length <= MAX_STORED_BYTES) {
      storage.setItem(FLOW_GRAPH_BACKUP_KEY, raw);
    }
  } catch {
    // sem espaço para o backup: segue sem ele
  }
}

export function loadFlowGraph(storage: StorageLike | null = defaultStorage()): FlowGraph {
  if (!storage) return createEmptyGraph();
  let raw: string | null = null;
  try {
    raw = storage.getItem(FLOW_GRAPH_STORAGE_KEY);
    if (!raw) return createEmptyGraph();
    if (raw.length > MAX_STORED_BYTES) {
      backupInvalid(raw, storage);
      return createEmptyGraph();
    }
    const parsed = parseFlowGraph(JSON.parse(raw));
    if (parsed.ok) return parsed.graph;
    backupInvalid(raw, storage);
    return createEmptyGraph();
  } catch {
    if (raw) backupInvalid(raw, storage);
    return createEmptyGraph();
  }
}

export function saveViewState(state: FlowViewState, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(FLOW_VIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // preferência visual: perder não é grave
  }
}

export function loadViewState(storage: StorageLike | null = defaultStorage()): FlowViewState {
  try {
    const raw = storage?.getItem(FLOW_VIEW_STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_BYTES) return createDefaultViewState();
    return parseViewState(JSON.parse(raw));
  } catch {
    return createDefaultViewState();
  }
}
