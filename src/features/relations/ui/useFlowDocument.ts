// src/features/relations/ui/useFlowDocument.ts
// Documento do fluxo: grafo (fonte da verdade) + estado de visualização, com carga validada,
// sincronização dos nós de tabela com as planilhas e gravação com debounce.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../../../types/spreadsheet';
import { syncTableNodes } from '../model/editor';
import { FlowGraph } from '../model/graph';
import { loadFlowGraph, loadViewState, saveFlowGraph, saveViewState } from '../model/persistence';
import { FlowViewState, StoredViewport } from '../model/viewState';

const SAVE_DELAY_MS = 300;

export interface FlowDocument {
  graph: FlowGraph;
  updateGraph: (update: (graph: FlowGraph) => FlowGraph) => void;
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

  const updateGraph = useCallback((update: (g: FlowGraph) => FlowGraph) => setGraph(update), []);
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

  return { graph, updateGraph, view, patchView, rememberViewport };
}
