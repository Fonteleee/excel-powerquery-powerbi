// src/features/relations/ui/FlowCanvas.tsx
// Aba de Relacionamentos: canvas do fluxo. O GRAFO (FlowGraph) é a fonte da verdade:
//   tabela -> transformação (buscar/agregar/filtrar) -> saída (nova aba, materialização idempotente).
// Este componente só compõe estado e eventos; a lógica fica em model/, analysis/ e runtime/.

import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeartPulse, Sparkles } from 'lucide-react';
import { Sheet } from '../../../types/spreadsheet';
import { AddTableModal } from '../../../components/Relations/AddTableModal';
import { loadRelationEdges } from '../../../utils/storageManager';
import { describeCable } from '../analysis/cableStatus';
import { createConnectContext } from '../analysis/connectContext';
import { applyConnectOperation, ColumnRef, connectColumnToPort } from '../analysis/connectPlan';
import { ConnectOperation, suggestOperations } from '../analysis/suggestions';
import { inputsOf } from '../model/dag';
import {
  addOutputNode,
  addTableNode,
  addTransformNode,
  changeTransformOp,
  defaultParams,
  moveNode,
  removeEdge,
  removeNode,
  renameOutput,
  syncTableNodes,
  updateTransformParams,
} from '../model/editor';
import { FlowGraph, FlowPort, TransformParams } from '../model/graph';
import { parseFlowGraph } from '../model/schema';
import { FlowExportPopover } from './export/FlowExportPopover';
import { LegacyMigrationResult, migrateLegacyEdges } from '../model/legacy';
import { DEFAULT_VIEWPORT } from '../model/viewState';
import { evaluateGraph } from '../runtime/evaluate';
import { flowSheetId, materializeGraph } from '../runtime/materialize';
import { buildCardColumns, flowBounds, outputStatus } from './cardData';
import { resolveEdgeEndpoints, sourceColumnHint } from './cableEndpoints';
import { CableBadge, CableLayer, CableView } from './CableLayer';
import { CableInspector, InspectorAnchor } from './CableInspector';
import { DataHealthPanel } from './DataHealthPanel';
import { applyFixToSheets, healthTargetSheet } from './healthModel';
import type { HealthFix } from '../analysis/healthTypes';
import { CanvasLegend, CanvasToolbar, ZoomControls } from './CanvasToolbar';
import { ConnectionPopover, PopoverTarget } from './ConnectionPopover';
import {
  cablePath,
  clampZoom,
  detailLevelForZoom,
  fitViewport,
  OffsetMap,
  Point,
  sameOffsets,
  screenToWorld,
  Viewport,
  zoomAround,
} from './geometry';
import { LegacyBanner } from './LegacyBanner';
import { NodeDrawer } from './NodeDrawer';
import { OutputNodeView } from './OutputNodeView';
import { PreviewPanel } from './PreviewGrid';
import { TableCard } from './TableCard';
import { tokenCssVars } from './tokens';
import { TransformNodeView } from './TransformNodeView';
import { DropTarget, PinRef, useCanvasGestures } from './useCanvasGestures';
import { useFlowDocument } from './useFlowDocument';
import { useFlowEvaluation } from './useFlowEvaluation';
import { nodeDisplayName } from './labels';
import './relations.css';

export interface FlowCanvasProps {
  sheets: Sheet[];
  onUpdateSheets: (sheets: Sheet[]) => void;
  /** Abre uma aba na grade de dados. */
  onOpenSheet?: (sheetId: string) => void;
  onOpenCopilot?: () => void;
  onOpenImportModal?: () => void;
  /** Desfaz a última alteração das planilhas (histórico do App); usado pelo painel de saúde. */
  onUndoSheets?: () => void;
}

interface Toast {
  text: string;
  tone: 'ok' | 'error' | 'info';
}

interface PendingPair {
  from: ColumnRef;
  to: ColumnRef;
}

interface HoverTip {
  nodeId: string;
  x: number;
  y: number;
}

const CSS_VARS = tokenCssVars() as CSSProperties;
const HOVER_DELAY_MS = 450;
const INSPECTOR_ID = 'rel-cable-inspector';
const TOOLTIP_WIDTH = 380;
const DRAWER_RESERVE_PX = 440;

export const FlowCanvas: React.FC<FlowCanvasProps> = ({ sheets, onUpdateSheets, onOpenSheet, onOpenCopilot, onOpenImportModal, onUndoSheets }) => {
  const doc = useFlowDocument(sheets);
  const { graph, updateGraph, view, patchView } = doc;
  const results = useFlowEvaluation(graph, sheets);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const initialViewportWasDefault = useRef(
    view.viewport.zoom === DEFAULT_VIEWPORT.zoom && view.viewport.panX === DEFAULT_VIEWPORT.panX && view.viewport.panY === DEFAULT_VIEWPORT.panY
  );
  const didInitialFit = useRef(false);

  // ---- Viewport (zoom e pan) -------------------------------------------------------------------
  const [viewport, setViewportState] = useState<Viewport>(() => ({ ...view.viewport }));
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const setViewport = useCallback((update: (vp: Viewport) => Viewport) => {
    setViewportState(prev => {
      const next = update(prev);
      return { ...next, zoom: clampZoom(next.zoom) };
    });
  }, []);
  const { rememberViewport } = doc;
  useEffect(() => rememberViewport(viewport), [viewport, rememberViewport]);
  const lod = detailLevelForZoom(viewport.zoom);

  // ---- Âncoras dos pinos medidas no DOM --------------------------------------------------------
  const [anchors, setAnchors] = useState<Record<string, OffsetMap>>({});
  const reportAnchors = useCallback((nodeId: string, offsets: OffsetMap) => {
    setAnchors(prev => (sameOffsets(prev[nodeId], offsets) ? prev : { ...prev, [nodeId]: offsets }));
  }, []);

  // ---- Seleção, painel, avisos -----------------------------------------------------------------
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pair, setPair] = useState<PendingPair | null>(null);
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tip, setTip] = useState<HoverTip | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [inspector, setInspector] = useState<(InspectorAnchor & { cableId: string }) | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [legacyReport, setLegacyReport] = useState<LegacyMigrationResult | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverId = useRef<string | null>(null);

  const showToast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    []
  );

  const legacyEdges = useMemo(() => loadRelationEdges(), []);
  const showLegacy = legacyEdges.length > 0 && (!view.legacyHandled || legacyReport !== null);

  // ---- Dados derivados -------------------------------------------------------------------------
  const sheetById = useMemo(() => new Map(sheets.map(s => [s.id, s])), [sheets]);
  const sheetNames = useMemo(() => new Map(sheets.map(s => [s.id, s.name])), [sheets]);
  const ctx = useMemo(() => createConnectContext(graph, results, sheetNames), [graph, results, sheetNames]);
  const nodeById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
  const collapsed = useMemo(() => new Set(view.collapsed), [view.collapsed]);

  const cardColumns = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildCardColumns>>();
    for (const node of graph.nodes) {
      if (node.kind === 'table') map.set(node.id, buildCardColumns(results.get(node.id)?.table));
    }
    return map;
  }, [graph.nodes, results]);

  const linkedColumns = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      const column = sourceColumnHint(graph, edge);
      if (!column) continue;
      const set = map.get(edge.from) ?? new Set<string>();
      set.add(column);
      map.set(edge.from, set);
    }
    return map;
  }, [graph]);

  const cables = useMemo<CableView[]>(
    () =>
      graph.edges.flatMap(edge => {
        const ends = resolveEdgeEndpoints(graph, edge, anchors);
        if (!ends) return [];
        const path = cablePath(ends.from, ends.to);
        const status = describeCable(graph, edge, results);
        return [{ id: edge.id, d: path.d, mid: path.mid, ...status, selected: edge.id === selectedEdgeId, lookupNodeId: status.lookup ? edge.to : undefined }];
      }),
    [graph, anchors, results, selectedEdgeId]
  );

  const availableSheets = useMemo(() => {
    const present = new Set(graph.nodes.flatMap(n => (n.kind === 'table' ? [n.sheetId] : [])));
    return sheets.filter(s => !present.has(s.id) && !s.id.startsWith('flow-out-')).map(s => ({ id: s.id, name: s.name }));
  }, [graph.nodes, sheets]);

  const outputCount = graph.nodes.filter(n => n.kind === 'output').length;
  const errorCount = useMemo(
    () => graph.nodes.filter(n => { const r = results.get(n.id); return !!r?.error && !r.rootCause; }).length,
    [graph.nodes, results]
  );
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  // ---- Posição e enquadramento -----------------------------------------------------------------
  const surfaceCenterWorld = useCallback((): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 120, y: 120 };
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return screenToWorld(centre, { x: rect.left, y: rect.top }, viewportRef.current);
  }, []);

  /** Enquadra todo o fluxo. `reserveRight` deixa espaço livre à direita (painel lateral aberto). */
  const fit = useCallback((reserveRight = 0) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const bounds = flowBounds(graphRef.current);
    if (!rect || !bounds) {
      setViewport(() => ({ ...DEFAULT_VIEWPORT }));
      return;
    }
    const width = Math.max(240, rect.width - reserveRight);
    setViewport(() => fitViewport(bounds, { width, height: rect.height }, 56));
  }, [setViewport]);

  // Depois de criar nós por uma ligação, enquadra tudo deixando o painel lateral livre.
  const pendingFit = useRef(false);
  useEffect(() => {
    if (!pendingFit.current) return;
    pendingFit.current = false;
    const width = surfaceRef.current?.getBoundingClientRect().width ?? 0;
    fit(Math.min(DRAWER_RESERVE_PX, width * 0.5));
  }, [graph, fit]);

  useEffect(() => {
    if (didInitialFit.current || graph.nodes.length === 0) return;
    didInitialFit.current = true;
    if (initialViewportWasDefault.current) fit();
  }, [graph.nodes.length, fit]);

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const pivot = { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
      setViewport(vp => zoomAround(vp, vp.zoom * factor, pivot));
    },
    [setViewport]
  );

  // ---- Edição do grafo -------------------------------------------------------------------------
  const select = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setTip(null);
  }, []);

  const openNewNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setDrawerOpen(true);
  }, []);

  const handleAddTable = useCallback((sheetId: string) => {
    const at = surfaceCenterWorld();
    const result = addTableNode(graphRef.current, sheetId, { x: at.x - 140, y: at.y - 120 });
    if (result.ok) {
      updateGraph(() => result.graph);
      select(result.id);
    } else showToast(result.error, 'error');
  }, [surfaceCenterWorld, updateGraph, select, showToast]);

  const handleAddTransform = useCallback((op: TransformParams['op']) => {
    const at = surfaceCenterWorld();
    const result = addTransformNode(graphRef.current, defaultParams(op), { x: at.x - 88, y: at.y - 60 });
    if (result.ok) {
      updateGraph(() => result.graph);
      openNewNode(result.id);
    } else showToast(result.error, 'error');
  }, [surfaceCenterWorld, updateGraph, openNewNode, showToast]);

  const handleAddOutput = useCallback(() => {
    const at = surfaceCenterWorld();
    const result = addOutputNode(graphRef.current, 'Resultado', { x: at.x - 104, y: at.y - 40 });
    if (result.ok) {
      updateGraph(() => result.graph);
      openNewNode(result.id);
    } else showToast(result.error, 'error');
  }, [surfaceCenterWorld, updateGraph, openNewNode, showToast]);

  const handleRemoveNode = useCallback((nodeId: string) => {
    updateGraph(g => removeNode(g, nodeId));
    setSelectedNodeId(prev => (prev === nodeId ? null : prev));
    setDrawerOpen(prev => (selectedNodeId === nodeId ? false : prev));
    setTip(null);
  }, [updateGraph, selectedNodeId]);

  const handleRemoveEdge = useCallback((edgeId: string) => {
    updateGraph(g => removeEdge(g, edgeId));
    setSelectedEdgeId(null);
  }, [updateGraph]);

  const handleToggleCollapse = useCallback((nodeId: string) => {
    const next = new Set(view.collapsed);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    patchView({ collapsed: [...next] });
  }, [view.collapsed, patchView]);

  // Importação de fluxo (aba _Flow_v1): revalida pelo mesmo schema da carga, sincroniza com as planilhas abertas
  // e substitui o grafo na hora; a persistência (debounce) é a mesma de qualquer edição.
  const handleImportGraph = useCallback((imported: FlowGraph) => {
    const checked = parseFlowGraph(imported);
    if (!checked.ok) {
      showToast('O fluxo importado não passou na validação e foi ignorado.', 'error');
      return;
    }
    const synced = syncTableNodes(checked.graph, sheets.map(s => ({ id: s.id, name: s.name })), doc.view.knownSheetIds);
    patchView({ knownSheetIds: synced.known });
    updateGraph(() => synced.graph);
    select(null);
    setDrawerOpen(false);
    pendingFit.current = true;
    showToast('Fluxo importado e aplicado à tela.', 'ok');
  }, [sheets, doc.view.knownSheetIds, patchView, updateGraph, select, showToast]);

  // ---- Executar o fluxo (avaliar + materializar nas abas de saída) -----------------------------
  const handleRun = useCallback(() => {
    const fresh = evaluateGraph(graphRef.current, sheets);
    const outcome = materializeGraph(graphRef.current, sheets, fresh);
    if (outcome.written.length > 0 || outcome.removed.length > 0) onUpdateSheets(outcome.sheets);
    const failed = Object.keys(outcome.errors).length;
    if (failed > 0) {
      const first = Object.values(outcome.errors)[0];
      showToast(`${outcome.written.length} aba(s) gerada(s); ${failed} saída(s) com erro: ${first}`, 'error');
    } else if (outcome.written.length === 0) {
      showToast('Nenhuma saída para gerar. Adicione uma saída e ligue-a a uma transformação.', 'info');
    } else {
      showToast(`${outcome.written.length} aba(s) gerada(s) a partir do fluxo.`, 'ok');
    }
  }, [sheets, onUpdateSheets, showToast]);

  // ---- Ligações --------------------------------------------------------------------------------
  const handleDrop = useCallback((source: PinRef, target: DropTarget | null, client: Point) => {
    if (!target) return;
    const g = graphRef.current;
    const targetNode = g.nodes.find(n => n.id === target.nodeId);
    const sourceNode = g.nodes.find(n => n.id === source.nodeId);
    if (!targetNode || !sourceNode || target.side === 'out') return;

    if (targetNode.kind === 'table') {
      const fromColumn = sourceNode.kind === 'table' && source.key !== '*' ? source.key : null;
      const toColumn = target.key && target.key !== '*' ? target.key : null;
      if (!fromColumn || !toColumn) {
        showToast('Para cruzar tabelas, arraste de um campo e solte sobre um campo da outra tabela.', 'info');
        return;
      }
      if (source.nodeId === target.nodeId && fromColumn === toColumn) return;
      const fromType = ctx.typeOf(source.nodeId, fromColumn);
      const toType = ctx.typeOf(target.nodeId, toColumn);
      const rect = surfaceRef.current?.getBoundingClientRect();
      setPair({ from: { nodeId: source.nodeId, column: fromColumn }, to: { nodeId: target.nodeId, column: toColumn } });
      setPopover({
        x: client.x - (rect?.left ?? 0) + 12,
        y: client.y - (rect?.top ?? 0) - 24,
        fromLabel: fromColumn,
        toLabel: toColumn,
        fromType,
        toType,
        suggestions: suggestOperations(fromType, toType, { sameTable: source.nodeId === target.nodeId }),
      });
      return;
    }

    let port: FlowPort = 'in';
    if (target.key === 'lookup') port = 'lookup';
    else if (target.key === null && targetNode.kind === 'transform' && targetNode.params.op === 'lookup') {
      port = inputsOf(g, targetNode.id).in ? 'lookup' : 'in';
    }
    const column = sourceNode.kind === 'table' && source.key !== '*' ? source.key : undefined;
    const result = connectColumnToPort(g, { nodeId: source.nodeId, column }, targetNode.id, port, ctx);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    updateGraph(() => result.graph);
    if (targetNode.kind === 'transform') openNewNode(targetNode.id);
    else select(targetNode.id);
  }, [ctx, updateGraph, openNewNode, select, showToast]);

  const handlePickOperation = useCallback((op: ConnectOperation) => {
    if (!pair) return;
    const outcome = applyConnectOperation(graphRef.current, pair.from, pair.to, op, ctx);
    setPopover(null);
    setPair(null);
    if (!outcome.ok) {
      showToast(outcome.error, 'error');
      return;
    }
    updateGraph(() => outcome.graph);
    pendingFit.current = true;
    openNewNode(outcome.focusId);
  }, [pair, ctx, updateGraph, openNewNode, showToast]);

  // ---- Gestos ----------------------------------------------------------------------------------
  const anchorOf = useCallback((pin: PinRef): Point => {
    const node = graphRef.current.nodes.find(n => n.id === pin.nodeId);
    const offsets = anchors[pin.nodeId];
    const key = `out:${pin.key}`;
    const o = offsets?.[key] ?? offsets?.['out:*'];
    return node && o ? { x: node.x + o.x, y: node.y + o.y } : { x: node?.x ?? 0, y: node?.y ?? 0 };
  }, [anchors]);

  const gestures = useCanvasGestures({
    surfaceRef,
    viewport,
    setViewport,
    getNodePosition: id => {
      const node = graphRef.current.nodes.find(n => n.id === id);
      return node ? { x: node.x, y: node.y } : null;
    },
    anchorOf,
    onMoveNode: (id, x, y) => updateGraph(g => moveNode(g, id, x, y)),
    onSelectNode: select,
    onActivateNode: id => {
      const node = graphRef.current.nodes.find(n => n.id === id);
      if (node && node.kind !== 'table') setDrawerOpen(true);
    },
    onBackgroundClick: () => {
      select(null);
      setDrawerOpen(false);
    },
    onDrop: handleDrop,
  });

  // ---- Saúde dos dados: a correção entra no histórico de desfazer das planilhas (onUpdateSheets do App) ----
  const healthSheet = useMemo(
    () => (healthOpen ? healthTargetSheet(graph, selectedNodeId, sheets) : null),
    [healthOpen, graph, selectedNodeId, sheets]
  );
  const handleApplyFix = useCallback((sheetId: string, fix: HealthFix): string | null => {
    const outcome = applyFixToSheets(sheets, sheetId, fix);
    if (!outcome.ok) return outcome.error;
    onUpdateSheets(outcome.sheets);
    return null;
  }, [sheets, onUpdateSheets]);

  // ---- Inspetor de falhas do cabo (hover e foco no selo) -----------------------------------------
  const handleInspect = useCallback((cable: CableView, el: HTMLElement | null) => {
    const surface = surfaceRef.current?.getBoundingClientRect();
    if (!el || !surface || !cable.lookupNodeId) {
      setInspector(prev => (prev?.cableId === cable.id ? null : prev));
      return;
    }
    const rect = el.getBoundingClientRect();
    setInspector({
      cableId: cable.id,
      nodeId: cable.lookupNodeId,
      x: rect.left - surface.left + rect.width / 2,
      y: rect.top - surface.top + (rect.top - surface.top < 220 ? rect.height : 0),
    });
  }, []);

  // ---- Dica ao passar o mouse (preview do nó) ----------------------------------------------------
  const handleSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    gestures.bindings.onPointerMove(e);
    if (e.buttons !== 0 || gestures.isConnecting) return;
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node-id]');
    const id = nodeEl?.dataset.nodeId ?? null;
    if (id === hoverId.current) return;
    hoverId.current = id;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTip(null);
    const node = id ? nodeById.get(id) : null;
    if (!nodeEl || !node || node.kind === 'table') return;
    hoverTimer.current = setTimeout(() => {
      const rect = nodeEl.getBoundingClientRect();
      const surface = surfaceRef.current?.getBoundingClientRect();
      if (!surface) return;
      setTip({ nodeId: node.id, x: rect.left - surface.left + rect.width / 2, y: rect.top - surface.top });
    }, HOVER_DELAY_MS);
  };

  const handleSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    rootRef.current?.focus({ preventScroll: true });
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTip(null);
    gestures.bindings.onPointerDown(e);
  };

  // ---- Teclado ---------------------------------------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.key === 'Escape') {
      if (popover) {
        setPopover(null);
        setPair(null);
      } else if (gestures.isConnecting) gestures.cancel();
      else if (drawerOpen) setDrawerOpen(false);
      else select(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedEdgeId) handleRemoveEdge(selectedEdgeId);
      else if (selectedNodeId) handleRemoveNode(selectedNodeId);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && target.dataset.nodeId) {
      e.preventDefault();
      select(target.dataset.nodeId);
      setDrawerOpen(true);
      return;
    }
    if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-') zoomBy(1 / 1.2);
    else if (e.key === '0') fit();
  };

  // ---- Renderização ----------------------------------------------------------------------------
  const draftPath = gestures.draft ? { d: cablePath(gestures.draft.start, gestures.draft.current).d } : null;
  const surfaceRect = surfaceRef.current?.getBoundingClientRect();
  const tipNode = tip ? nodeById.get(tip.nodeId) : undefined;
  const showTip = tip !== null && tipNode !== undefined && !(drawerOpen && selectedNodeId === tip.nodeId);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      data-connecting={gestures.isConnecting ? 'true' : undefined}
      className="rel-root relative flex h-full min-h-0 flex-1 flex-col overflow-hidden focus:outline-hidden"
      style={CSS_VARS}
    >
      <CanvasToolbar
        availableSheets={availableSheets}
        showKeysOnly={view.showKeysOnly}
        outputCount={outputCount}
        errorCount={errorCount}
        onAddTable={handleAddTable}
        onNewTable={() => setAddModalOpen(true)}
        onAddTransform={handleAddTransform}
        onAddOutput={handleAddOutput}
        onToggleKeysOnly={value => patchView({ showKeysOnly: value })}
        onRun={handleRun}
        extras={
          <>
            <button
              type="button"
              onClick={() => setHealthOpen(v => !v)}
              aria-pressed={healthOpen}
              title="Saúde dos dados da tabela selecionada, com correções propostas"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[length:var(--rel-text-body)] font-bold text-emerald-900 transition-colors hover:bg-emerald-50"
            >
              <HeartPulse className="size-4" aria-hidden /> Saúde
            </button>
            <FlowExportPopover graph={graph} sheets={sheets} onImportGraph={handleImportGraph} fileBase="fluxo" />
          </>
        }
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={surfaceRef}
          className="rel-dots absolute inset-0 overflow-hidden"
          style={{
            backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
            backgroundSize: `${22 * viewport.zoom}px ${22 * viewport.zoom}px`,
            cursor: gestures.isConnecting ? 'crosshair' : 'default',
          }}
          onPointerDown={handleSurfacePointerDown}
          onPointerMove={handleSurfacePointerMove}
          onPointerUp={gestures.bindings.onPointerUp}
          onPointerCancel={gestures.bindings.onPointerCancel}
          onDoubleClick={e => {
            const id = (e.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
            if (id) {
              select(id);
              setDrawerOpen(true);
            }
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}
          >
            <CableLayer cables={cables} draft={draftPath} onSelect={id => { setSelectedEdgeId(id); setSelectedNodeId(null); }} />

            {graph.nodes.map(node => {
              if (node.kind === 'table') {
                const result = results.get(node.id);
                const draft = gestures.draft;
                return (
                  <TableCard
                    key={node.id}
                    nodeId={node.id}
                    x={node.x}
                    y={node.y}
                    sheetName={sheetNames.get(node.sheetId) ?? `Planilha ${node.sheetId}`}
                    rowCount={result?.table ? result.table.rows.length : null}
                    error={result?.error ?? null}
                    columns={cardColumns.get(node.id) ?? []}
                    collapsed={collapsed.has(node.id)}
                    showKeysOnly={view.showKeysOnly}
                    lod={lod}
                    zoom={viewport.zoom}
                    selected={selectedNodeId === node.id}
                    connecting={gestures.isConnecting}
                    linkedColumns={linkedColumns.get(node.id) ?? EMPTY_SET}
                    activePin={draft && draft.source.nodeId === node.id ? `out:${draft.source.key}` : null}
                    report={reportAnchors}
                    onToggleCollapse={handleToggleCollapse}
                    onRemove={handleRemoveNode}
                  />
                );
              }
              if (node.kind === 'transform') {
                const draft = gestures.draft;
                return (
                  <TransformNodeView
                    key={node.id}
                    nodeId={node.id}
                    x={node.x}
                    y={node.y}
                    label={node.label}
                    params={node.params}
                    result={results.get(node.id)}
                    selected={selectedNodeId === node.id}
                    lod={lod}
                    zoom={viewport.zoom}
                    connecting={gestures.isConnecting}
                    activePin={draft && draft.source.nodeId === node.id ? 'out:*' : null}
                    report={reportAnchors}
                  />
                );
              }
              const result = results.get(node.id);
              return (
                <OutputNodeView
                  key={node.id}
                  nodeId={node.id}
                  x={node.x}
                  y={node.y}
                  sheetName={node.sheetName}
                  result={result}
                  status={outputStatus(sheetById.get(flowSheetId(node.id)), result?.table)}
                  selected={selectedNodeId === node.id}
                  lod={lod}
                  zoom={viewport.zoom}
                  connecting={gestures.isConnecting}
                  report={reportAnchors}
                />
              );
            })}

            <div className="absolute left-0 top-0">
              {cables.map(cable => (
                <CableBadge
                  key={cable.id}
                  cable={cable}
                  lod={lod}
                  onRemove={handleRemoveEdge}
                  onSelect={id => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
                  onInspect={handleInspect}
                  inspectorId={INSPECTOR_ID}
                  inspecting={inspector?.cableId === cable.id}
                />
              ))}
            </div>
          </div>
        </div>

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-md rounded-2xl border border-slate-300 bg-white/95 p-6 shadow-md">
              <h2 className="text-[length:var(--rel-text-heading)] font-extrabold">Seu fluxo está vazio</h2>
              <p className="mt-1 text-[length:var(--rel-text-body)] text-slate-700">
                Use “Tabela” na barra acima para trazer uma planilha. Depois arraste de um campo até um campo de outra tabela para cruzá-las.
              </p>
            </div>
          </div>
        )}

        {graph.nodes.length > 0 && !graph.nodes.some(n => n.kind === 'transform') && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 max-w-lg -translate-x-1/2 rounded-xl border border-indigo-300 bg-white/95 px-4 py-2 text-center text-[length:var(--rel-text-body)] text-slate-800 shadow-md">
            <strong>Dica:</strong> arraste do pino à direita de um campo até o pino à esquerda de um campo de outra tabela. A chave é inferida e
            as operações aparecem ordenadas pelo tipo dos dados.
          </div>
        )}

        {showLegacy && (
          <LegacyBanner
            count={legacyEdges.length}
            report={legacyReport}
            onRebuild={() => {
              const migrated = migrateLegacyEdges(legacyEdges, sheets, graphRef.current);
              updateGraph(() => migrated.graph);
              setLegacyReport(migrated);
              patchView({ legacyHandled: true });
            }}
            onDismiss={() => {
              setLegacyReport(null);
              patchView({ legacyHandled: true });
            }}
          />
        )}

        <ZoomControls
          zoom={viewport.zoom}
          onZoomIn={() => zoomBy(1.2)}
          onZoomOut={() => zoomBy(1 / 1.2)}
          onFit={() => fit(drawerOpen && selectedNode ? Math.min(DRAWER_RESERVE_PX, (surfaceRect?.width ?? 0) * 0.5) : 0)}
          onReset={() => setViewport(vp => zoomAround(vp, 1, { x: (surfaceRect?.width ?? 0) / 2, y: (surfaceRect?.height ?? 0) / 2 }))}
        />
        <CanvasLegend className="left-44" />

        {onOpenCopilot && (
          <button
            type="button"
            onClick={onOpenCopilot}
            className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-[length:var(--rel-text-body)] font-bold text-violet-100 shadow-lg hover:bg-slate-800"
            style={{ right: drawerOpen && selectedNode ? 'calc(var(--rel-drawer-width, 420px) + 16px)' : undefined }}
          >
            <Sparkles className="size-4 text-violet-300" aria-hidden /> NocoAI
          </button>
        )}

        {showTip && tip && tipNode && (
          <div
            className="rel-popover pointer-events-none absolute z-30 p-2"
            style={{
              width: TOOLTIP_WIDTH,
              left: Math.max(8, Math.min(tip.x - TOOLTIP_WIDTH / 2, (surfaceRect?.width ?? TOOLTIP_WIDTH) - TOOLTIP_WIDTH - 8)),
              top: tip.y > 200 ? undefined : tip.y + 130,
              bottom: tip.y > 200 ? (surfaceRect?.height ?? 0) - tip.y + 8 : undefined,
            }}
            role="tooltip"
          >
            <div className="mb-1 truncate text-[length:var(--rel-text-caption)] font-bold">{nodeDisplayName(tipNode, sheetNames)}</div>
            <PreviewPanel result={results.get(tipNode.id)} limit={5} maxHeight={130} />
          </div>
        )}

        {healthOpen && (
          <DataHealthPanel
            sheet={healthSheet}
            onApply={handleApplyFix}
            onClose={() => setHealthOpen(false)}
            onUndo={onUndoSheets}
            rightOffset={drawerOpen && selectedNode ? DRAWER_RESERVE_PX : 16}
          />
        )}

        {inspector && (
          <CableInspector
            id={INSPECTOR_ID}
            graph={graph}
            results={results}
            anchor={inspector}
            bounds={{ width: surfaceRect?.width ?? 800, height: surfaceRect?.height ?? 600 }}
          />
        )}

        {popover && (
          <ConnectionPopover
            target={popover}
            bounds={{ width: surfaceRect?.width ?? 800, height: surfaceRect?.height ?? 600 }}
            onPick={handlePickOperation}
            onClose={() => {
              setPopover(null);
              setPair(null);
            }}
          />
        )}

        {drawerOpen && selectedNode && (
          <NodeDrawer
            key={selectedNode.id}
            node={selectedNode}
            graph={graph}
            results={results}
            sheetNames={sheetNames}
            outputStatus={
              selectedNode.kind === 'output'
                ? outputStatus(sheetById.get(flowSheetId(selectedNode.id)), results.get(selectedNode.id)?.table)
                : 'pending'
            }
            onClose={() => setDrawerOpen(false)}
            onChangeParams={(id, params) => updateGraph(g => updateTransformParams(g, id, params))}
            onChangeOp={(id, op) => updateGraph(g => changeTransformOp(g, id, op))}
            onRenameOutput={(id, name) => updateGraph(g => renameOutput(g, id, name))}
            onRemove={handleRemoveNode}
            onRunFlow={handleRun}
            onOpenSheet={onOpenSheet}
          />
        )}

        {toast && (
          <div
            role="status"
            className={`absolute bottom-4 left-1/2 z-50 max-w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[length:var(--rel-text-body)] font-semibold text-white shadow-xl ${
              toast.tone === 'error' ? 'bg-rose-800' : toast.tone === 'ok' ? 'bg-emerald-800' : 'bg-slate-800'
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>

      <AddTableModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddSheet={newSheet => onUpdateSheets([...sheets, newSheet])}
        onOpenImport={onOpenImportModal}
      />
    </div>
  );
};

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
