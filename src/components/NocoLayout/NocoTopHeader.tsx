import React from 'react';
import {
  ChevronsRight,
  Box,
  Table as TableIcon,
  LayoutDashboard,
  Share2,
  RefreshCw,
  Undo2,
  Redo2,
  Download,
  Upload,
  MoreHorizontal,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';

interface NocoTopHeaderProps {
  sheet: Sheet;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeView: 'spreadsheet' | 'powerquery' | 'powerbi';
  onSelectView: (view: 'spreadsheet' | 'powerquery' | 'powerbi') => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onRefresh: () => void;
  onExportExcel: () => void;
  onOpenImportModal: () => void;
  onToggleCopilot: () => void;
}

export const NocoTopHeader: React.FC<NocoTopHeaderProps> = ({
  sheet,
  isSidebarOpen,
  onToggleSidebar,
  activeView,
  onSelectView,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onRefresh,
  onExportExcel,
  onOpenImportModal,
  onToggleCopilot,
}) => {
  const cleanTableName = sheet.name || 'Acompanhamento_de_Dados';

  return (
    <header className="h-12 bg-white border-b border-[#e2e8f0] px-3 flex items-center justify-between select-none z-10">
      {/* Left: Sidebar Toggle + Breadcrumb + View Switcher */}
      <div className="flex items-center gap-2.5 min-w-0">
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            title="Expandir menu de tabelas"
            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-sans truncate">
          <div className="size-4 rounded bg-rose-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
            <Box className="size-2.5" />
          </div>
          <span className="text-slate-400">/</span>
          <span className="font-medium text-slate-600 truncate max-w-[160px] hover:text-slate-900 cursor-pointer">
            Base_Workspace
          </span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-800 truncate max-w-[200px]">
            {cleanTableName}
          </span>
        </div>

        {/* View Switcher Tabs (Data vs Details/Analytics) */}
        <div className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 ml-2">
          <button
            onClick={() => onSelectView('spreadsheet')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="size-3.5 text-indigo-600" />
            <span>Data</span>
          </button>

          <button
            onClick={() => onSelectView('powerbi')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeView === 'powerbi'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="size-3.5 text-emerald-600" />
            <span>Analytics</span>
          </button>
        </div>
      </div>

      {/* Right: Actions (Refresh, Undo/Redo, Export, Share) */}
      <div className="flex items-center gap-1.5">
        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          title="Desfazer (Ctrl+Z)"
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          onClick={onRedo}
          title="Refazer (Ctrl+Y)"
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <Redo2 className="size-3.5" />
        </button>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          title="Recalcular Planilha / Atualizar"
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <RefreshCw className="size-3.5" />
        </button>

        {/* Import CSV / XLSX */}
        <button
          onClick={onOpenImportModal}
          title="Importar Arquivo (CSV / Excel)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
        >
          <Upload className="size-3 text-slate-500" />
          <span>Importar</span>
        </button>

        {/* Export XLSX with Formulas */}
        <button
          onClick={onExportExcel}
          title="Exportar para Excel (.XLSX)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
        >
          <Download className="size-3 text-slate-500" />
          <span>Exportar</span>
        </button>

        {/* NocoAI Copilot Trigger */}
        <button
          onClick={onToggleCopilot}
          title="NocoAI Assistente"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-xs hover:opacity-95 transition-opacity cursor-pointer ml-1"
        >
          <Sparkles className="size-3.5" />
          <span>NocoAI</span>
        </button>

        {/* Share Button (NocoDB Signature Blue) */}
        <button
          onClick={onExportExcel}
          title="Compartilhar / Salvar"
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-xs transition-colors cursor-pointer ml-1"
        >
          <Share2 className="size-3.5" />
          <span>Share</span>
        </button>
      </div>
    </header>
  );
};
