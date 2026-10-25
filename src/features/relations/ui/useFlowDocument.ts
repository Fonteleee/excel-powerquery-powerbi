// src/features/relations/ui/useFlowDocument.ts
// Documento do fluxo: grafo (fonte da verdade) + estado de visualização, com carga validada,
// sincronização dos nós de tabela com as planilhas e gravação com debounce.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../../../types/spreadsheet';
import { syncTableNodes } from '../model/editor';
import { FlowGraph } from '../model/graph';
import { canRedo, canUndo, createHistory, GraphHistory, recordEdit, redo, undo } from '../model/history';
import { FLOW_EXTERNAL_UPDATE_EVENT, loadFlowGraph, loadViewState, saveFlowGraph, saveViewState } from '../model/persistence';
import { parseFlowGraph } from '../model/schema';
import { FlowViewState, StoredViewport } from '../model/viewState';

const SAVE_DELAY_MS = 300;

export interface GraphEditOptions {
  /** Edições seguidas com a mesma chave (ex.: arrastar um nó) viram um único passo de desfazer. */
  coalesceKey?: string;
}

export interface FlowDocument {
  graph: FlowGraph;
  updateGraph: (update: (graph: FlowGraph) => FlowGraph, options?: GraphEditOptions) => void;
  undoGraph: () => boolean;
  redoGraph: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  view: FlowViewState;
  patchView: (patch: Partial<Omit<FlowViewState, 'viewport'>>) => void;
  /** Guarda zoom/pan sem re-renderizar (só persiste). */
  rememberViewport: (viewport: StoredViewport) => void;
}

export function useFlowDocument(sheets: readonly Sheet[]): FlowDocument {
  // Carga síncrona e já sincronizada com as planilhas: a aba nunca pisca vazia no primeiro quadro.
  const [initial] = useState(() => {
    const storedView = loadViewState();
    const synced = syncTableNodes(
      loadFlowGraph(),
      sheets.map(s => ({ id: s.id, name: s.name })),
      storedView.knownSheetIds
    );
    return { graph: synced.graph, view: { ...storedView, knownSheetIds: synced.known } };
  });
  const [graph, setGraph] = useState<FlowGraph>(initial.graph);
  const [view, setView] = useState<FlowViewState>(initial.view);
  const viewportRef = useRef<StoredViewport>(view.viewport);
  const viewRef = useRef(view);
  viewRef.current = view;
  const graphRef = useRef(graph);
  graphRef.current = graph;

  // Nós de tabela para planilhas novas. Planilhas já conhecidas cujo nó foi removido não voltam sozinhas.
  const sheetKey = useMemo(() => sheets.map(s => s.id).join('|'), [sheets]);
  useEffect(() => {
    const refs = sheets.map(s => ({ id: s.id, name: s.name }));
    const synced = syncTableNodes(graphRef.current, refs, viewRef.current.knownSheetIds);
    if (synced.graph !== graphRef.current) setGraph(synced.graph);
    if (synced.known.length !== viewRef.current.knownSheetIds.length) {
      setView(v => ({ ...v, knownSheetIds: synced.known }));
    }
    // `sheets` entra pela assinatura de ids; reavaliar a cada edição de célula não é necessário aqui.
  }, [sheetKey]);

  useEffect(() => {
    const timer = setTimeout(() => saveFlowGraph(graph), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [graph]);

  const persistViewSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = useCallback(() => {
    if (persistViewSoon.current) clearTimeout(persistViewSoon.current);
    persistViewSoon.current = setTimeout(() => {
      saveViewState({ ...viewRef.current, viewport: viewportRef.current });
    }, SAVE_DELAY_MS);
  }, []);

  useEffect(() => {
    schedulePersist();
  }, [view, schedulePersist]);

  useEffect(
    () => () => {
      // Ao sair da aba, grava o que estiver pendente.
      if (persistViewSoon.current) clearTimeout(persistViewSoon.current);
      saveViewState({ ...viewRef.current, viewport: viewportRef.current });
    },
    []
  );

  // Histórico do grafo (independente do das planilhas). Mantido em ref; só os flags viram estado.
  const historyRef = useRef<GraphHistory>(createHistory());
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });
  const syncFlags = useCallback(() => {
    const next = { canUndo: canUndo(historyRef.current), canRedo: canRedo(historyRef.current) };
    setFlags(prev => (prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next));
  }, []);

  const updateGraph = useCallback(
    (update: (g: FlowGraph) => FlowGraph, options?: GraphEditOptions) => {
      const previous = graphRef.current;
      const next = update(previous);
      if (next === previous) return;
      historyRef.current = recordEdit(historyRef.current, previous, { coalesceKey: options?.coalesceKey });
      graphRef.current = next;
      setGraph(next);
      syncFlags();
    },
    [syncFlags]
  );

  // Alterações vindas de fora (a IA) entram como uma edição normal, com desfazer.
  useEffect(() => {
    const onExternal = (event: Event): void => {
      const checked = parseFlowGraph((event as CustomEvent<unknown>).detail);
      if (checked.ok) updateGraph(() => checked.graph);
    };
    window.addEventListener(FLOW_EXTERNAL_UPDATE_EVENT, onExternal);
    return () => window.removeEventListener(FLOW_EXTERNAL_UPDATE_EVENT, onExternal);
  }, [updateGraph]);

  const undoGraph = useCallback((): boolean => {
    const step = undo(historyRef.current, graphRef.current);
    if (!step) return false;
    historyRef.current = step.history;
    graphRef.current = step.graph;
    setGraph(step.graph);
    syncFlags();
    return true;
  }, [syncFlags]);

  const redoGraph = useCallback((): boolean => {
    const step = redo(historyRef.current, graphRef.current);
    if (!step) return false;
    historyRef.current = step.history;
    graphRef.current = step.graph;
    setGraph(step.graph);
    syncFlags();
    return true;
  }, [syncFlags]);
  const patchView = useCallback(
    (patch: Partial<Omit<FlowViewState, 'viewport'>>) => setView(v => ({ ...v, ...patch })),
    []
  );
  const rememberViewport = useCallback(
    (viewport: StoredViewport) => {
      viewportRef.current = viewport;
      schedulePersist();
    },
    [schedulePersist]
  );

  return { graph, updateGraph, view, patchView, rememberViewport, undoGraph, redoGraph, canUndo: flags.canUndo, canRedo: flags.canRedo };
}
