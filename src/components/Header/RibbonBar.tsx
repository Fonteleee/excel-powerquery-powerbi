import React, { useState } from 'react';
import {
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  DollarSign,
  Percent,
  Search,
  Plus,
  Trash2,
  Filter,
  ArrowUpDown,
  Type,
  PaintBucket,
  Table,
  Sparkles,
  Download,
  Grid,
  FileSpreadsheet,
  HelpCircle,
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Calculator,
  Layers,
  Database,
  Eye,
  FileText,
  Upload,
  RefreshCw,
  FolderOpen,
  Check,
  X,
  Keyboard,
  ExternalLink,
} from 'lucide-react';
import { Sheet, CellRange, CellFormat } from '../../types/spreadsheet';
import { cellPosToKey, recalculateSheet } from '../../engine/formulaParser';
import { exportSheetToExcel } from '../../utils/excelExporter';

interface RibbonBarProps {
  sheet: Sheet;
  selectedRange: CellRange;
  activeView: 'spreadsheet' | 'powerquery' | 'powerbi';
  onSetActiveView: (view: 'spreadsheet' | 'powerquery' | 'powerbi') => void;
  onUpdateSheet: (sheet: Sheet) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenQuickAnalysis: () => void;
  onOpenFormulaWizard: () => void;
  onOpenTextToColumns: () => void;
  onOpenConditionalModal: () => void;
  onOpenImportExport: () => void;
  onOpenShortcutsModal: () => void;
  onOpenFindReplace: () => void;
  onInsertFormulaTemplate: (template: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
  onNewWorkbook?: () => void;
  onLoadSampleSales?: () => void;
  onLoadSampleHR?: () => void;
  onLoadSampleBudget?: () => void;
  showGridlines?: boolean;
  onToggleGridlines?: () => void;
  showFormulaBar?: boolean;
  onToggleFormulaBar?: () => void;
  zoomLevel?: number;
  onSetZoomLevel?: (zoom: number) => void;
}

export const RibbonBar: React.FC<RibbonBarProps> = ({
  sheet,
  selectedRange,
  activeView,
  onSetActiveView,
  onUpdateSheet,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenQuickAnalysis,
  onOpenFormulaWizard,
  onOpenTextToColumns,
  onOpenConditionalModal,
  onOpenImportExport,
  onOpenShortcutsModal,
  onOpenFindReplace,
  onInsertFormulaTemplate,
  isCopilotOpen = false,
  onToggleCopilot,
  onNewWorkbook,
  onLoadSampleSales,
  onLoadSampleHR,
  onLoadSampleBudget,
  showGridlines = true,
  onToggleGridlines,
  showFormulaBar = true,
  onToggleFormulaBar,
  zoomLevel = 100,
  onSetZoomLevel,
}) => {
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'formulas' | 'data' | 'view' | 'help'>('home');
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<'text' | 'bg' | null>(null);

  // Apply format to all cells in selected range
  const applyFormat = (formatPatch: Partial<CellFormat>) => {
    const updatedData = { ...sheet.data };
    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        const key = cellPosToKey(r, c);
        const existing = updatedData[key] || { raw: '', value: '' };
        updatedData[key] = {
          ...existing,
          format: {
            ...existing.format,
            ...formatPatch,
          },
        };
      }
    }
    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
  };

  // Merge selected cells
  const handleMergeAndCenter = () => {
    const isAlreadyMerged = sheet.mergedRegions.some(
      m =>
        m.startRow === selectedRange.startRow &&
        m.startCol === selectedRange.startCol &&
        m.endRow === selectedRange.endRow &&
        m.endCol === selectedRange.endCol
    );

    if (isAlreadyMerged) {
      const updatedRegions = sheet.mergedRegions.filter(
        m =>
          !(
            m.startRow === selectedRange.startRow &&
            m.startCol === selectedRange.startCol &&
            m.endRow === selectedRange.endRow &&
            m.endCol === selectedRange.endCol
          )
      );
      onUpdateSheet({ ...sheet, mergedRegions: updatedRegions });
    } else {
      if (selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol) {
        return;
      }
      const newRegion = { id: `merge-${Date.now()}`, ...selectedRange };
      applyFormat({ align: 'center' });
      onUpdateSheet({
        ...sheet,
        mergedRegions: [...sheet.mergedRegions, newRegion],
      });
    }
  };

  // Border helper
  const handleApplyBorders = (type: 'all' | 'thick' | 'none') => {
    if (type === 'none') {
      applyFormat({ border: undefined });
    } else if (type === 'thick') {
      applyFormat({ border: { top: true, bottom: true, left: true, right: true, color: '#107c41', style: 'thick' } });
    } else {
      applyFormat({ border: { top: true, bottom: true, left: true, right: true, color: '#d4d4d4', style: 'solid' } });
    }
  };


  // Delete selected rows
  const handleDeleteRow = () => {
    const updatedData = { ...sheet.data };
    const rStart = selectedRange.startRow;
    const rEnd = selectedRange.endRow;
    const count = rEnd - rStart + 1;

    for (let r = 0; r < sheet.rowCount; r++) {
      if (r >= rStart && r <= rEnd) continue;
      const targetR = r > rEnd ? r - count : r;
      for (let c = 0; c < sheet.colCount; c++) {
        const srcKey = cellPosToKey(r, c);
        const destKey = cellPosToKey(targetR, c);
        if (sheet.data[srcKey]) {
          updatedData[destKey] = sheet.data[srcKey];
        } else {
          delete updatedData[destKey];
        }
      }
    }

    const newRowCount = Math.max(10, sheet.rowCount - count);
    const recalculated = recalculateSheet({
      ...sheet,
      data: updatedData,
      rowCount: newRowCount,
    });
    onUpdateSheet(recalculated);
  };

  // Insert blank row
  const handleInsertRow = () => {
    const updatedData = { ...sheet.data };
    const insertAt = selectedRange.startRow;

    for (let r = sheet.rowCount - 1; r >= insertAt; r--) {
      for (let c = 0; c < sheet.colCount; c++) {
        const srcKey = cellPosToKey(r, c);
        const destKey = cellPosToKey(r + 1, c);
        if (sheet.data[srcKey]) {
          updatedData[destKey] = sheet.data[srcKey];
          delete updatedData[srcKey];
        }
      }
    }

    const recalculated = recalculateSheet({
      ...sheet,
      data: updatedData,
      rowCount: sheet.rowCount + 1,
    });
    onUpdateSheet(recalculated);
  };

  const colors = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#107c41', '#0e6b37', '#0b532c', '#043419', '#1e293b', '#334155', '#475569', '#64748b', '#0284c7', '#0369a1',
  ];

  return (
    <div className="flex flex-col bg-[#f5f5f5] text-[#242424] border-b border-[#e0e0e0] font-sans select-none relative z-30 shadow-2xs">
      {/* 1. TOP SUITE BAR (Office 365 Top Header) */}
      <div className="h-11 px-3 flex items-center justify-between bg-[#f5f5f5] border-b border-[#e0e0e0]">
        {/* Left: 9-dot Waffle + Green Excel Icon + Document Title */}
        <div className="flex items-center gap-2.5">
          <button
            title="Inicializador de Aplicativos"
            className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer transition-colors"
          >
            <div className="grid grid-cols-3 gap-0.5 size-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="size-0.8 bg-[#242424] rounded-full" />
              ))}
            </div>
          </button>

          {/* Green Excel Square Icon */}
          <div className="size-6.5 rounded-md bg-[#107c41] flex items-center justify-center text-white shadow-2xs">
            <span className="font-bold text-xs">X</span>
          </div>

          {/* Title & OneDrive Status */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={sheet.name}
              onChange={e => onUpdateSheet({ ...sheet, name: e.target.value })}
              className="font-semibold text-sm text-[#242424] bg-transparent hover:bg-white/80 focus:bg-white px-1.5 py-0.5 rounded border border-transparent focus:border-[#107c41] outline-hidden max-w-[280px] truncate"
            />
            <span title="Salvo no OneDrive" className="text-xs text-[#707070] flex items-center gap-1 cursor-default">
              <span>☁️✓</span>
            </span>
          </div>
        </div>

        {/* Center: Search Box (Alt + Q) */}
        <div
          onClick={onOpenFindReplace}
          className="hidden md:flex items-center gap-2 w-96 h-7.5 px-3 bg-white border border-[#e0e0e0] hover:border-[#107c41] rounded-md text-xs text-[#707070] cursor-pointer shadow-2xs transition-colors"
        >
          <Search className="size-3.5 text-[#707070]" />
          <span className="truncate">Pesquisar ferramentas, fórmulas e ajuda (Alt + Q)</span>
        </div>

        {/* Right: Comments, Module Switchers, Copilot, Compartilhar */}
        <div className="flex items-center gap-2">
          {/* Module Switcher Pills */}
          <div className="flex items-center p-0.5 bg-[#ebebeb] rounded-md border border-[#e0e0e0]">
            <button
              onClick={() => {
                onSetActiveView('spreadsheet');
                setActiveRibbonTab('home');
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'spreadsheet'
                  ? 'bg-white text-[#107c41] shadow-2xs font-bold'
                  : 'text-[#505050] hover:text-[#242424]'
              }`}
            >
              Planilha
            </button>
            <button
              onClick={() => {
                onSetActiveView('powerquery');
                setActiveRibbonTab('data');
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'powerquery'
                  ? 'bg-white text-[#4338ca] shadow-2xs font-bold'
                  : 'text-[#505050] hover:text-[#4338ca]'
              }`}
            >
              Power Query
            </button>
            <button
              onClick={() => {
                onSetActiveView('powerbi');
                setActiveRibbonTab('view');
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'powerbi'
                  ? 'bg-white text-[#b45309] shadow-2xs font-bold'
                  : 'text-[#505050] hover:text-[#b45309]'
              }`}
            >
              Power BI
            </button>
          </div>

          {/* Copilot AI Button (Office 365 / Gemini Pro) */}
          <button
            onClick={onToggleCopilot}
            title="Abrir Excel Copilot AI (Google Gemini Pro)"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              isCopilotOpen
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-white border border-purple-300 text-purple-800 hover:bg-purple-50'
            }`}
          >
            <Sparkles className={`size-3.5 ${isCopilotOpen ? 'text-white' : 'text-purple-600'}`} />
            <span>Copilot</span>
          </button>

          {/* Compartilhar / Exportar XLSX Button (Green) */}
          <button
            onClick={() => exportSheetToExcel(sheet, sheet.name)}
            title="Compartilhar / Exportar Pasta de Trabalho (.xlsx)"
            className="flex items-center gap-1.5 px-3 py-1 bg-[#107c41] hover:bg-[#0e6b37] text-white rounded-md text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="size-3.5" />
            <span>Compartilhar</span>
          </button>
        </div>
      </div>

      {/* 2. RIBBON TABS (7 Clean, Non-Redundant, 100% Functional Tabs) */}
      <div className="h-7.5 px-2 flex items-center justify-between bg-[#f5f5f5] text-xs font-normal text-[#242424] border-b border-[#e0e0e0]">
        <div className="flex items-center gap-0.5 h-full">
          {/* Arquivo (Backstage Menu Toggle) */}
          <button
            onClick={() => setShowFileMenu(prev => !prev)}
            className={`px-3 h-full flex items-center gap-1 font-semibold rounded-t cursor-pointer transition-colors ${
              showFileMenu
                ? 'bg-[#107c41] text-white'
                : 'hover:bg-[#ebebeb] text-[#107c41]'
            }`}
          >
            <FileSpreadsheet className="size-3.5" />
            <span>Arquivo</span>
          </button>

          {/* Início */}
          <button
            onClick={() => {
              onSetActiveView('spreadsheet');
              setActiveRibbonTab('home');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'home' && !showFileMenu && activeView === 'spreadsheet'
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Início
          </button>

          {/* Inserir */}
          <button
            onClick={() => {
              onSetActiveView('spreadsheet');
              setActiveRibbonTab('insert');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'insert' && !showFileMenu
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Inserir
          </button>

          {/* Fórmulas */}
          <button
            onClick={() => {
              onSetActiveView('spreadsheet');
              setActiveRibbonTab('formulas');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'formulas' && !showFileMenu
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Fórmulas
          </button>

          {/* Dados */}
          <button
            onClick={() => {
              setActiveRibbonTab('data');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'data' && !showFileMenu
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Dados
          </button>

          {/* Exibir */}
          <button
            onClick={() => {
              setActiveRibbonTab('view');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'view' && !showFileMenu
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Exibir
          </button>

          {/* Ajuda */}
          <button
            onClick={() => {
              setActiveRibbonTab('help');
              setShowFileMenu(false);
            }}
            className={`px-3 h-full flex items-center cursor-pointer transition-colors ${
              activeRibbonTab === 'help' && !showFileMenu
                ? 'text-[#107c41] font-semibold border-b-2 border-[#107c41] bg-white/60'
                : 'hover:bg-[#ebebeb] text-[#242424]'
            }`}
          >
            Ajuda
          </button>
        </div>

        {/* Right: Ribbon Collapse/Expand Toggle Chevron */}
        <button
          onClick={() => setIsRibbonCollapsed(!isRibbonCollapsed)}
          title={isRibbonCollapsed ? "Exibir Barra de Ferramentas" : "Ocultar Barra de Ferramentas"}
          className="p-1 rounded hover:bg-[#ebebeb] text-[#707070] hover:text-[#242424] cursor-pointer transition-colors"
        >
          <ChevronDown className={`size-3.5 transition-transform duration-200 ${isRibbonCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* 3. ARQUIVO BACKSTAGE DROPDOWN DIALOG */}
      {showFileMenu && (
        <div className="absolute left-2 top-18.5 z-50 w-84 bg-white border border-[#e0e0e0] rounded-lg shadow-2xl p-3 animate-in fade-in slide-in-from-top-2 duration-150 font-sans text-xs">
          <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2 mb-2">
            <span className="font-semibold text-xs text-[#242424] flex items-center gap-1.5">
              <FileSpreadsheet className="size-4 text-[#107c41]" />
              <span>Menu Arquivo</span>
            </span>
            <button
              onClick={() => setShowFileMenu(false)}
              className="p-1 rounded hover:bg-[#ebebeb] text-[#707070] cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => {
                onNewWorkbook?.();
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f0f9f3] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FileText className="size-4 text-[#107c41]" />
              <div>
                <div className="font-semibold">Nova Planilha em Branco</div>
                <div className="text-[10px] text-[#707070]">Iniciar pasta de trabalho limpa</div>
              </div>
            </button>

            <button
              onClick={() => {
                onOpenImportExport();
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f0f9f3] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Upload className="size-4 text-blue-600" />
              <div>
                <div className="font-semibold">Abrir / Importar Arquivo</div>
                <div className="text-[10px] text-[#707070]">Carregar CSV ou XLSX do computador</div>
              </div>
            </button>

            <button
              onClick={() => {
                exportSheetToExcel(sheet, sheet.name);
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f0f9f3] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="size-4 text-[#107c41]" />
              <div>
                <div className="font-semibold">Exportar como Excel (.xlsx)</div>
                <div className="text-[10px] text-[#707070]">Salvar pasta de trabalho localmente</div>
              </div>
            </button>

            <div className="h-px bg-[#e0e0e0] my-1.5" />
            <div className="px-2.5 py-1 text-[10px] font-bold text-[#707070] uppercase">Modelos de Exemplo</div>

            <button
              onClick={() => {
                onLoadSampleSales?.();
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f5f5f5] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <BarChart3 className="size-4 text-emerald-600" />
              <div>
                <div className="font-semibold">Modelo de Vendas & BI</div>
                <div className="text-[10px] text-[#707070]">Tabela com 60 vendas, comissões e totais</div>
              </div>
            </button>

            <button
              onClick={() => {
                onLoadSampleHR?.();
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f5f5f5] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Layers className="size-4 text-purple-600" />
              <div>
                <div className="font-semibold">Modelo de RH & Folha</div>
                <div className="text-[10px] text-[#707070]">Controle de colaboradores e departamentos</div>
              </div>
            </button>

            <button
              onClick={() => {
                onLoadSampleBudget?.();
                setShowFileMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-md hover:bg-[#f5f5f5] text-left text-[#242424] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <DollarSign className="size-4 text-amber-600" />
              <div>
                <div className="font-semibold">Modelo de Orçamento DRE</div>
                <div className="text-[10px] text-[#707070]">Planejamento orçamentário e centros de custo</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 4. RIBBON TOOLBAR BODY (100% Active Tool Panels for each tab) */}
      {!isRibbonCollapsed && (
        <div className="h-10 px-3 py-1 flex items-center gap-2 overflow-x-auto scrollbar-none bg-[#f5f5f5] text-xs text-[#242424] border-b border-[#e0e0e0] animate-in slide-in-from-top-1 duration-150">

          {/* TAB 1: INÍCIO (Home) */}
          {activeRibbonTab === 'home' && (
            <>
              {/* Desfazer / Refazer */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-[#d4d4d4]">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Desfazer (Ctrl+Z)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] disabled:opacity-30 text-[#242424] cursor-pointer"
                >
                  <Undo className="size-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Refazer (Ctrl+Y)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] disabled:opacity-30 text-[#242424] cursor-pointer"
                >
                  <Redo className="size-3.5" />
                </button>
              </div>

              {/* Formatação de Fonte */}
              <div className="flex items-center gap-1 pr-2 border-r border-[#d4d4d4]">
                <button
                  onClick={() => applyFormat({ bold: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.bold })}
                  title="Negrito (Ctrl+B)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] font-bold cursor-pointer"
                >
                  <Bold className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ italic: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.italic })}
                  title="Itálico (Ctrl+I)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <Italic className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ underline: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.underline })}
                  title="Sublinhado (Ctrl+U)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <Underline className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ strike: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.strike })}
                  title="Tachado"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <Strikethrough className="size-3.5" />
                </button>

                <div className="h-4 w-px bg-[#d4d4d4] mx-0.5" />

                {/* Color Pickers */}
                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
                    title="Cor do Texto"
                    className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] flex items-center cursor-pointer"
                  >
                    <Type className="size-3.5 text-red-600" />
                    <ChevronDown className="size-2.5 text-[#707070]" />
                  </button>
                  {showColorPicker === 'text' && (
                    <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-[#e0e0e0] rounded-md shadow-xl grid grid-cols-5 gap-1 z-50">
                      {colors.slice(0, 20).map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            applyFormat({ textColor: c });
                            setShowColorPicker(null);
                          }}
                          className="size-4 rounded-xs border border-black/10 cursor-pointer"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === 'bg' ? null : 'bg')}
                    title="Cor de Preenchimento"
                    className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] flex items-center cursor-pointer"
                  >
                    <PaintBucket className="size-3.5 text-amber-500" />
                    <ChevronDown className="size-2.5 text-[#707070]" />
                  </button>
                  {showColorPicker === 'bg' && (
                    <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-[#e0e0e0] rounded-md shadow-xl grid grid-cols-5 gap-1 z-50">
                      {colors.slice(0, 20).map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            applyFormat({ bgColor: c });
                            setShowColorPicker(null);
                          }}
                          className="size-4 rounded-xs border border-black/10 cursor-pointer"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Alinhamento & Mesclagem */}
              <div className="flex items-center gap-1 pr-2 border-r border-[#d4d4d4]">
                <button
                  onClick={() => applyFormat({ align: 'left' })}
                  title="Alinhar à Esquerda"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <AlignLeft className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ align: 'center' })}
                  title="Centralizar"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <AlignCenter className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ align: 'right' })}
                  title="Alinhar à Direita"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] cursor-pointer"
                >
                  <AlignRight className="size-3.5" />
                </button>
                <button
                  onClick={handleMergeAndCenter}
                  title="Mesclar e Centralizar"
                  className="px-2 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-[11px] font-medium cursor-pointer"
                >
                  Mesclar
                </button>
              </div>

              {/* Formato Numérico */}
              <div className="flex items-center gap-1 pr-2 border-r border-[#d4d4d4]">
                <button
                  onClick={() => applyFormat({ type: 'currency' })}
                  title="Formatar como Moeda (R$)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] font-semibold cursor-pointer"
                >
                  <DollarSign className="size-3.5 text-[#107c41]" />
                </button>
                <button
                  onClick={() => applyFormat({ type: 'percentage' })}
                  title="Formatar como Porcentagem (%)"
                  className="p-1.5 rounded hover:bg-[#ebebeb] text-[#242424] font-semibold cursor-pointer"
                >
                  <Percent className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ type: 'general' })}
                  title="Formato Geral"
                  className="px-2 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-[11px] font-medium cursor-pointer"
                >
                  Geral
                </button>
              </div>


              {/* Formatação Condicional & Ações */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onOpenConditionalModal}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
                >
                  <Sparkles className="size-3.5 text-amber-600" />
                  <span>Formatação Condicional</span>
                </button>
                <button
                  onClick={onOpenQuickAnalysis}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
                >
                  <BarChart3 className="size-3.5 text-[#107c41]" />
                  <span>Análise Rápida (Ctrl+Q)</span>
                </button>
                <button
                  onClick={handleDeleteRow}
                  title="Excluir Linhas Selecionadas"
                  className="p-1.5 rounded hover:bg-rose-50 text-rose-700 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </>
          )}

          {/* TAB 2: INSERIR (Insert) */}
          {activeRibbonTab === 'insert' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSetActiveView('powerbi')}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-semibold text-[#b45309] cursor-pointer"
              >
                <BarChart3 className="size-3.5" />
                <span>Gráficos no Power BI</span>
              </button>
              <button
                onClick={() => onSetActiveView('powerbi')}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-semibold text-purple-700 cursor-pointer"
              >
                <Table className="size-3.5" />
                <span>Tabela Dinâmica</span>
              </button>
              <div className="h-4 w-px bg-[#d4d4d4]" />
              <button
                onClick={onOpenFormulaWizard}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                <Calculator className="size-3.5 text-[#107c41]" />
                <span>Inserir Função (fx)</span>
              </button>
              <button
                onClick={handleInsertRow}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                <Plus className="size-3.5 text-[#107c41]" />
                <span>Inserir Linha Acima</span>
              </button>
            </div>
          )}

          {/* TAB 3: FÓRMULAS (Formulas) */}
          {activeRibbonTab === 'formulas' && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenFormulaWizard}
                className="flex items-center gap-1 px-3 py-1 bg-[#107c41] text-white hover:bg-[#0e6b37] rounded text-xs font-semibold cursor-pointer shadow-2xs"
              >
                <Calculator className="size-3.5" />
                <span>Assistente fx</span>
              </button>
              <div className="h-4 w-px bg-[#d4d4d4] mx-1" />
              <button
                onClick={() => onInsertFormulaTemplate('=SOMA(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                ∑ SOMA
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=MÉDIA(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                MÉDIA
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=PROCX(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                PROCX
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=SE(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                SE
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=SOMARPRODUTO(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                SOMARPRODUTO
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=UNIRTEXTO(')}
                className="px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                UNIRTEXTO
              </button>
              <div className="h-4 w-px bg-[#d4d4d4] mx-1" />
              <button
                onClick={() => onUpdateSheet(recalculateSheet(sheet))}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs text-[#707070] cursor-pointer"
              >
                <RefreshCw className="size-3" />
                <span>Recalcular</span>
              </button>
            </div>
          )}

          {/* TAB 4: DADOS (Data) */}
          {activeRibbonTab === 'data' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSetActiveView('powerquery')}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#4338ca] text-white hover:bg-[#3730a3] rounded text-xs font-semibold cursor-pointer shadow-2xs"
              >
                <Database className="size-3.5" />
                <span>Abrir Power Query Studio (ETL)</span>
              </button>
              <div className="h-4 w-px bg-[#d4d4d4]" />
              <button
                onClick={onOpenTextToColumns}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-medium cursor-pointer"
              >
                <Type className="size-3.5" />
                <span>Texto para Colunas</span>
              </button>
              <button
                onClick={() => onUpdateSheet({ ...sheet, filterEnabled: !sheet.filterEnabled })}
                className={`flex items-center gap-1 px-2.5 py-1 border rounded text-xs font-medium cursor-pointer ${
                  sheet.filterEnabled
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-[#e0e0e0] text-[#242424] hover:bg-[#ebebeb]'
                }`}
              >
                <Filter className="size-3.5" />
                <span>{sheet.filterEnabled ? 'Filtros Ativos' : 'Ativar Filtros'}</span>
              </button>
            </div>
          )}

          {/* TAB 5: EXIBIR (View) */}
          {activeRibbonTab === 'view' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSetActiveView('spreadsheet')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                  activeView === 'spreadsheet'
                    ? 'bg-[#107c41] text-white'
                    : 'bg-white border border-[#e0e0e0] text-[#242424] hover:bg-[#ebebeb]'
                }`}
              >
                <Grid className="size-3.5" />
                <span>Modo Planilha</span>
              </button>
              <button
                onClick={() => onSetActiveView('powerbi')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                  activeView === 'powerbi'
                    ? 'bg-[#b45309] text-white'
                    : 'bg-white border border-[#e0e0e0] text-[#242424] hover:bg-[#ebebeb]'
                }`}
              >
                <BarChart3 className="size-3.5" />
                <span>Power BI Dashboard Studio</span>
              </button>
              <div className="h-4 w-px bg-[#d4d4d4]" />
              <label className="flex items-center gap-1.5 text-xs text-[#242424] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGridlines}
                  onChange={onToggleGridlines}
                  className="rounded text-[#107c41] focus:ring-0"
                />
                <span>Linhas de Grade</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[#242424] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFormulaBar}
                  onChange={onToggleFormulaBar}
                  className="rounded text-[#107c41] focus:ring-0"
                />
                <span>Barra de Fórmulas</span>
              </label>
              <div className="h-4 w-px bg-[#d4d4d4]" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[#707070]">Zoom:</span>
                <button
                  onClick={() => onSetZoomLevel?.(75)}
                  className={`px-2 py-0.5 rounded text-[11px] ${zoomLevel === 75 ? 'bg-slate-200 font-bold' : 'hover:bg-[#ebebeb]'}`}
                >
                  75%
                </button>
                <button
                  onClick={() => onSetZoomLevel?.(100)}
                  className={`px-2 py-0.5 rounded text-[11px] ${zoomLevel === 100 ? 'bg-slate-200 font-bold' : 'hover:bg-[#ebebeb]'}`}
                >
                  100%
                </button>
                <button
                  onClick={() => onSetZoomLevel?.(125)}
                  className={`px-2 py-0.5 rounded text-[11px] ${zoomLevel === 125 ? 'bg-slate-200 font-bold' : 'hover:bg-[#ebebeb]'}`}
                >
                  125%
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: AJUDA (Help) */}
          {activeRibbonTab === 'help' && (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenShortcutsModal}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-semibold text-[#242424] cursor-pointer"
              >
                <Keyboard className="size-3.5 text-indigo-600" />
                <span>Teclas de Atalho do Excel</span>
              </button>
              <button
                onClick={onToggleCopilot}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-semibold text-purple-700 cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                <span>Excel Copilot AI (Gemini)</span>
              </button>
              <button
                onClick={onOpenFormulaWizard}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded text-xs font-semibold text-[#107c41] cursor-pointer"
              >
                <HelpCircle className="size-3.5" />
                <span>Catálogo de 22+ Funções</span>
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
