// src/utils/projectApply.ts
// Liga o arquivo de projeto (.verxel) ao armazenamento do navegador: lê o estado atual para salvar
// e grava o que veio do arquivo ao abrir. A lógica pura fica em projectFile.ts.

import type { Sheet } from '../types/spreadsheet';
import type { RelationEdge } from '../types/relations';
import { loadRelationEdges, loadUserPreferences, saveRelationEdges, UserPreferences } from './storageManager';
import { ProjectData, ProjectEnvelope } from './projectFile';
import { createEmptyGraph, FlowGraph } from '../features/relations/model/graph';
import { FLOW_EXTERNAL_UPDATE_EVENT, loadFlowGraph, saveFlowGraph } from '../features/relations/model/persistence';

export type OpenMode = 'replace' | 'append';

/** Fotografia do trabalho atual para gravar no arquivo. */
export function collectProjectData(sheets: Sheet[], activeSheetId: string, starred: Iterable<string>): ProjectData {
  const graph = loadFlowGraph();
  return {
    sheets,
    activeSheetId,
    starredSheetIds: [...starred],
    relationEdges: loadRelationEdges(),
    flowGraph: graph.nodes.length > 0 ? graph : null,
    preferences: { ...loadUserPreferences() },
  };
}

/**
 * Grava no armazenamento o que não é aba: arestas e fluxo de Relacionamentos.
 * Em "substituir" troca tudo; em "acrescentar" mantém o fluxo atual (os ids das abas novas mudam).
 */
export function applyProjectStorage(project: ProjectEnvelope, mode: OpenMode): void {
  if (mode !== 'replace') return;
  saveRelationEdges(project.relationEdges as RelationEdge[]);
  const graph = (project.flowGraph ?? createEmptyGraph()) as FlowGraph;
  saveFlowGraph(graph);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FLOW_EXTERNAL_UPDATE_EVENT, { detail: graph }));
}

/** Só chaves conhecidas e do tipo certo (o resto do arquivo é ignorado). */
export function pickPreferences(raw: Record<string, unknown>): UserPreferences {
  const out: UserPreferences = {};
  if (typeof raw.showGridlines === 'boolean') out.showGridlines = raw.showGridlines;
  if (typeof raw.showFormulaBar === 'boolean') out.showFormulaBar = raw.showFormulaBar;
  if (typeof raw.isSidebarOpen === 'boolean') out.isSidebarOpen = raw.isSidebarOpen;
  if (typeof raw.zoomLevel === 'number' && raw.zoomLevel >= 25 && raw.zoomLevel <= 400) out.zoomLevel = raw.zoomLevel;
  return out;
}
