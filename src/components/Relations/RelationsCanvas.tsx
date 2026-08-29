import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Minus,
  Maximize2,
  Table2,
  Sparkles,
  Zap,
  Layers,
  ArrowRight,
  Share2,
  CheckSquare,
  HelpCircle,
  Eye,
  RefreshCw,
  FolderOpen,
  Split,
  Calculator,
  X,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import {
  RelationNode,
  RelationEdge,
  CanvasViewport,
  ConnectionDraft,
} from '../../types/relations';
import { TableNodeCard } from './TableNodeCard';
import { RelationConfigModal } from './RelationConfigModal';
import { AddTableModal } from './AddTableModal';
import { applyRelationToSpreadsheet, getColumnHeaderName } from '../../engine/relationFormulaEngine';

interface RelationsCanvasProps {
  sheets: Sheet[];
  activeSheet: Sheet;
  onUpdateSheets: (newSheets: Sheet[]) => void;
  onNavigateView: (view: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations') => void;
  onOpenShare?: () => void;
  onOpenCopilot?: () => void;
  onOpenImportModal?: () => void;
}

export const RelationsCanvas: React.FC<RelationsCanvasProps> = ({
  sheets,
  activeSheet,
  onUpdateSheets,
  onNavigateView,
  onOpenShare,
  onOpenCopilot,
  onOpenImportModal,
}) => {
  // Canvas viewport state (Zoom & Pan)
  const [viewport, setViewport] = useState<CanvasViewport>({
    zoom: 1,
    panX: 100,
    panY: 50,
  });

  // Table Nodes position state
  const [nodes, setNodes] = useState<RelationNode[]>(() => {
    return sheets.map((sheet, index) => ({
      id: sheet.id,
      sheetId: sheet.id,
      sheetName: sheet.name,
      x: 80 + (index % 3) * 360,
      y: 60 + Math.floor(index / 3) * 320,
      isCollapsed: false,
    }));
  });

  // Add Table Modal state
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);

  // Sync nodes if sheets are added/removed
  useEffect(() => {
    setNodes(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const newNodes = [...prev];
      sheets.forEach((sheet, idx) => {
        if (!existingIds.has(sheet.id)) {
          newNodes.push({
            id: sheet.id,
            sheetId: sheet.id,
            sheetName: sheet.name,
            x: 80 + (idx % 3) * 360,
            y: 60 + Math.floor(idx / 3) * 320,
            isCollapsed: false,
          });
        }
      });
      return newNodes.filter(n => sheets.some(s => s.id === n.id));
    });
  }, [sheets]);

  // Edges (Relationships & Column-to-Column connections)
  const [edges, setEdges] = useState<RelationEdge[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<Partial<RelationEdge> | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);

  // Connection drafting (live drawing wire)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);

  // Canvas interaction states
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(activeSheet.id);

  // View settings
  const [showAllFields, setShowAllFields] = useState<boolean>(true);
  const [showKeysOnly, setShowKeysOnly] = useState<boolean>(false);

  // Onboarding Hint View Limit (Maximum 3 views for new users)
  const [showOnboardingHint, setShowOnboardingHint] = useState<boolean>(() => {
    try {
      const savedCount = parseInt(localStorage.getItem('noco_relations_hint_views') || '0', 10);
      return isNaN(savedCount) ? true : savedCount < 3;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      const savedCount = parseInt(localStorage.getItem('noco_relations_hint_views') || '0', 10);
      const currentCount = isNaN(savedCount) ? 0 : savedCount;
      if (currentCount < 3) {
        localStorage.setItem('noco_relations_hint_views', String(currentCount + 1));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDismissHint = () => {
    setShowOnboardingHint(false);
    try {
      localStorage.setItem('noco_relations_hint_views', '3');
    } catch {
      // ignore
    }
  };

  const canvasRef = useRef<HTMLDivElement>(null);

  // Zoom handlers
  const handleZoomIn = () => setViewport(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.15, 2.0) }));
  const handleZoomOut = () => setViewport(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.15, 0.4) }));
  const handleResetZoom = () => setViewport({ zoom: 1, panX: 100, panY: 50 });

  // Pan Canvas Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.panX, y: e.clientY - viewport.panY });
    }
  };

  // Node Dragging Handlers
  const handleNodeMouseDown = (e: React.MouseEvent, sheetId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === sheetId);
    if (!node) return;

    setSelectedNodeId(sheetId);
    setDraggingNodeId(sheetId);
    setNodeDragOffset({
      x: e.clientX / viewport.zoom - node.x,
      y: e.clientY / viewport.zoom - node.y,
    });
  };

  // Global Mouse Move for pan, node drag, and wire draft
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setViewport(prev => ({
        ...prev,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y,
      }));
    } else if (draggingNodeId) {
      setNodes(prev =>
        prev.map(node => {
          if (node.id === draggingNodeId) {
            return {
              ...node,
              x: e.clientX / viewport.zoom - nodeDragOffset.x,
              y: e.clientY / viewport.zoom - nodeDragOffset.y,
            };
          }
          return node;
        })
      );
    } else if (connectionDraft && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
      const currentY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;
      setConnectionDraft(prev => prev ? { ...prev, currentX, currentY } : null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    if (connectionDraft) {
      setConnectionDraft(null);
    }
  };

  // Connection Drag Start
  const handleStartConnection = (sheetId: string, colIdx: number, e?: React.MouseEvent) => {
    const node = nodes.find(n => n.id === sheetId);
    if (!node || !canvasRef.current) return;

    const startX = node.x + 288; // Right edge of card (w-72 = 288px)
    const startY = node.y + 40 + colIdx * 28 + 14;

    setConnectionDraft({
      sourceSheetId: sheetId,
      sourceColIdx: colIdx,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  };

  // Connection Drop Target (supports BOTH single sheet intra-column and cross-sheet)
  const handleEndConnection = (targetSheetId: string, targetColIdx: number) => {
    if (!connectionDraft) return;

    // Do not connect the exact same column to itself
    if (connectionDraft.sourceSheetId === targetSheetId && connectionDraft.sourceColIdx === targetColIdx) {
      setConnectionDraft(null);
      return;
    }

    const isSameSheet = connectionDraft.sourceSheetId === targetSheetId;

    const draftEdge: Partial<RelationEdge> = {
      id: `edge-${Date.now()}`,
      sourceSheetId: connectionDraft.sourceSheetId,
      sourceColIdx: connectionDraft.sourceColIdx,
      targetSheetId: targetSheetId,
      targetColIdx: targetColIdx,
      formulaType: isSameSheet ? 'SUM_COLS' : 'PROCX',
      returnColIdx: targetColIdx,
      outputDestination: 'next_column',
      delimiter: ' - ',
      createdAt: Date.now(),
    };

    setEditingEdge(draftEdge);
    setIsConfigModalOpen(true);
    setConnectionDraft(null);
  };

  // Success notification toast after relation execution
  const [savedSuccessToast, setSavedSuccessToast] = useState<{ formulaType: string; customName?: string } | null>(null);

  // Save Relation & Apply to Spreadsheets
  const handleSaveRelation = (edge: RelationEdge) => {
    setEdges(prev => [...prev.filter(e => e.id !== edge.id), edge]);

    // Apply the calculation/formula directly to spreadsheet data!
    const updatedSheets = applyRelationToSpreadsheet(edge, sheets);
    onUpdateSheets(updatedSheets);

    // Show instant success banner
    setSavedSuccessToast({
      formulaType: edge.formulaType,
      customName: edge.customColName,
    });
    setTimeout(() => {
      setSavedSuccessToast(null);
    }, 8000);
  };

  const handleDeleteRelation = (edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    setSelectedEdgeId(null);
  };

  // Delete table from diagram and workbook
  const handleDeleteTable = (sheetId: string) => {
    if (sheets.length <= 1) return;
    const remainingSheets = sheets.filter(s => s.id !== sheetId);
    setEdges(prev => prev.filter(e => e.sourceSheetId !== sheetId && e.targetSheetId !== sheetId));
    setNodes(prev => prev.filter(n => n.id !== sheetId));
    onUpdateSheets(remainingSheets);
  };

  // Calculate coordinates for curve rendering
  const getNodePortPos = (sheetId: string, colIdx: number, isSource: boolean) => {
    const node = nodes.find(n => n.id === sheetId);
    if (!node) return { x: 0, y: 0 };
    const x = isSource ? node.x + 288 : node.x;
    const y = node.y + 40 + (node.isCollapsed ? 0 : colIdx * 28 + 14);
    return { x, y };
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-slate-100 overflow-hidden select-none font-sans relative"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Canvas Sub-Header & Controls Bar */}
      <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
            <Zap className="size-3.5 text-indigo-600" />
            <span>Pipeline de Fórmulas & Cruzamentos</span>
            <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {sheets.length === 1 ? 'Modo Tabela Única (Coluna ➔ Coluna / Linhas)' : `${sheets.length} Tabelas Carregadas`}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Action to add extra sheet */}
          <button
            onClick={() => setIsAddTableModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold text-indigo-700 hover:bg-indigo-50 bg-indigo-50/60 border border-indigo-200 shadow-2xs transition-all cursor-pointer active:scale-95"
          >
            <Plus className="size-3.5 text-indigo-600" />
            <span>+ Adicionar Tabela</span>
          </button>
        </div>

        {/* View Toggles & Badges */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-slate-900">
            <input
              type="checkbox"
              checked={showAllFields}
              onChange={e => setShowAllFields(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span>Exibir Todos os Campos</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-slate-900">
            <input
              type="checkbox"
              checked={showKeysOnly}
              onChange={e => setShowKeysOnly(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span>Apenas Chaves</span>
          </label>
        </div>
      </div>

      {/* Canvas Area with Dot Grid */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        className="flex-1 w-full h-full relative overflow-hidden bg-slate-50 cursor-default bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]"
      >
        {/* Helper Banner for Single Table Mode (Exibido no máximo 3 vezes para novos usuários) */}
        {sheets.length === 1 && edges.length === 0 && showOnboardingHint && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 p-3.5 bg-white/95 backdrop-blur-md border border-indigo-200 rounded-2xl shadow-xl text-xs text-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 max-w-xl">
            <div className="size-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Zap className="size-4.5" />
            </div>
            <div className="flex-1 pr-1">
              <div className="font-bold text-slate-900 text-xs">Como conectar colunas na mesma tabela:</div>
              <div className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                Arraste do pino azul à direita de um campo (ex: <strong className="text-slate-900 font-bold">Campo_A</strong>) e solte no pino à esquerda de outro (ex: <strong className="text-slate-900 font-bold">Campo_B</strong>) para criar fórmulas (Soma, PROCX, Diferença, Concatenação ou Totais).
              </div>
            </div>
            <button
              onClick={handleDismissHint}
              title="Fechar dica"
              aria-label="Fechar dica de conexão"
              className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 btn-tactile"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Transformable Canvas Container */}
        <div
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {/* SVG Connection Lines Layer */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-auto overflow-visible">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Saved Relationship Edges */}
            {edges.map(edge => {
              const isSameSheet = edge.sourceSheetId === edge.targetSheetId;
              const start = getNodePortPos(edge.sourceSheetId, edge.sourceColIdx, true);
              const end = getNodePortPos(edge.targetSheetId, edge.targetColIdx, !isSameSheet ? false : true);
              const isSelected = selectedEdgeId === edge.id;

              let pathD = '';
              let midX = 0;
              let midY = 0;

              if (isSameSheet) {
                // Intra-table self loop curve on the right side of the card
                const loopSpread = 80;
                pathD = `M ${start.x} ${start.y} C ${start.x + loopSpread} ${start.y}, ${end.x + loopSpread} ${end.y}, ${end.x} ${end.y}`;
                midX = start.x + loopSpread * 0.75;
                midY = (start.y + end.y) / 2;
              } else {
                // Cross-table smooth Bezier curve
                const dx = Math.abs(end.x - start.x) * 0.5;
                pathD = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
                midX = (start.x + end.x) / 2;
                midY = (start.y + end.y) / 2;
              }

              return (
                <g key={edge.id} className="group cursor-pointer">
                  {/* Outer glow stroke */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#4f46e5' : '#818cf8'}
                    strokeWidth={isSelected ? 4 : 2.5}
                    strokeLinecap="round"
                    filter={isSelected ? 'url(#glow)' : undefined}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setEditingEdge(edge);
                      setIsConfigModalOpen(true);
                    }}
                  />

                  {/* Midpoint Formula Badge Button */}
                  <foreignObject
                    x={midX - 40}
                    y={midY - 14}
                    width={80}
                    height={28}
                    className="overflow-visible"
                  >
                    <button
                      onClick={() => {
                        setSelectedEdgeId(edge.id);
                        setEditingEdge(edge);
                        setIsConfigModalOpen(true);
                      }}
                      className="px-2 py-0.5 bg-white border border-indigo-500 shadow-md text-indigo-700 font-mono font-bold text-[10px] rounded-full hover:scale-110 hover:bg-indigo-50 transition-transform cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Zap className="size-2.5" />
                      <span>{edge.formulaType}</span>
                    </button>
                  </foreignObject>
                </g>
              );
            })}

            {/* Live Connection Draft (Dragging Wire) */}
            {connectionDraft && (
              <path
                d={`M ${connectionDraft.startX} ${connectionDraft.startY} C ${
                  connectionDraft.startX + Math.abs(connectionDraft.currentX - connectionDraft.startX) * 0.5 + 40
                } ${connectionDraft.startY}, ${
                  connectionDraft.currentX - Math.abs(connectionDraft.currentX - connectionDraft.startX) * 0.5
                } ${connectionDraft.currentY}, ${connectionDraft.currentX} ${connectionDraft.currentY}`}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2.5}
                strokeDasharray="5,5"
                strokeLinecap="round"
                className="animate-pulse"
              />
            )}
          </svg>

          {/* Table Cards Layer */}
          <div className="absolute inset-0 pointer-events-auto">
            {sheets.map(sheet => {
              const node = nodes.find(n => n.id === sheet.id);
              if (!node) return null;

              return (
                <TableNodeCard
                  key={sheet.id}
                  sheet={sheet}
                  node={node}
                  showAllFields={showAllFields}
                  showKeysOnly={showKeysOnly}
                  isSelected={selectedNodeId === sheet.id}
                  canDelete={sheets.length > 1}
                  activeSourcePin={
                    connectionDraft
                      ? { sheetId: connectionDraft.sourceSheetId, colIdx: connectionDraft.sourceColIdx }
                      : null
                  }
                  onSelectNode={setSelectedNodeId}
                  onStartConnection={handleStartConnection}
                  onEndConnection={handleEndConnection}
                  onNodeMouseDown={handleNodeMouseDown}
                  onToggleCollapse={id => {
                    setNodes(prev =>
                      prev.map(n => (n.id === id ? { ...n, isCollapsed: !n.isCollapsed } : n))
                    );
                  }}
                  onDeleteTable={handleDeleteTable}
                  onQuickCross={sheetId => {
                    const otherSheet = sheets.find(s => s.id !== sheetId) || sheet;
                    setEditingEdge({
                      id: `edge-${Date.now()}`,
                      sourceSheetId: sheetId,
                      sourceColIdx: 0,
                      targetSheetId: otherSheet.id,
                      targetColIdx: 0,
                      formulaType: otherSheet.id === sheetId ? 'SUM_COLS' : 'PROCX',
                      returnColIdx: 0,
                      outputDestination: 'next_column',
                      delimiter: ' - ',
                      createdAt: Date.now(),
                    });
                    setIsConfigModalOpen(true);
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom-Left Zoom & Pan Controls */}
        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-2xl shadow-xl border border-slate-200/80">
          <button
            onClick={handleZoomIn}
            title="Aproximar Zoom (+)"
            className="size-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <Plus className="size-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Afastar Zoom (-)"
            className="size-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <Minus className="size-4" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            onClick={handleResetZoom}
            title="Resetar Zoom (100%)"
            className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer font-mono"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            onClick={handleResetZoom}
            title="Centralizar Visualização"
            className="size-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

        {/* Floating Success Notification Toast */}
        {savedSuccessToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-indigo-500/50 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="size-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
              ✓
            </div>
            <div className="text-xs">
              <span className="font-bold text-emerald-400">Conexão {savedSuccessToast.formulaType} Criada:</span>{' '}
              <span>Fórmulas injetadas e calculadas com sucesso na tabela de dados!</span>
            </div>
            <button
              onClick={() => onNavigateView('spreadsheet')}
              className="ml-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <span>Ver na Tabela de Dados</span>
              <ArrowRight className="size-3" />
            </button>
          </div>
        )}

        {/* Bottom-Right Floating AI Assistant Pill */}
        {onOpenCopilot && (
          <button
            onClick={onOpenCopilot}
            className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white font-bold text-xs shadow-lg hover:shadow-xl transition-all cursor-pointer active:scale-95"
          >
            <Sparkles className="size-4" />
            <span>+ NocoAI</span>
          </button>
        )}
      </div>

      {/* Relation Configuration Modal */}
      {isConfigModalOpen && (
        <RelationConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => {
            setIsConfigModalOpen(false);
            setEditingEdge(null);
          }}
          edgeDraft={editingEdge}
          sheets={sheets}
          onSaveRelation={handleSaveRelation}
          onDeleteRelation={handleDeleteRelation}
        />
      )}

      {/* Add Table Modal */}
      <AddTableModal
        isOpen={isAddTableModalOpen}
        onClose={() => setIsAddTableModalOpen(false)}
        onAddSheet={newSheet => {
          onUpdateSheets([...sheets, newSheet]);
        }}
        onOpenImport={onOpenImportModal}
      />
    </div>
  );
};
