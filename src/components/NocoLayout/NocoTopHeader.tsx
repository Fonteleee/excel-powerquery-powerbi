import React, { useState } from 'react';
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
  activeView: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations';
  onSelectView: (view: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations') => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onRefresh: () => void;
  onExportExcel: () => void;
  onOpenImportModal: () => void;
  onToggleCopilot: () => void;
  onOpenShare: () => void;
  onRenameSheet?: (newName: string) => void;
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
  onOpenShare,
  onRenameSheet,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState(sheet.name || 'Tabela');

  const handleFinishRename = () => {
    setIsRenaming(false);
    if (tempName.trim() && onRenameSheet && tempName !== sheet.name) {
      onRenameSheet(tempName.trim());
    }
  };

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
          <span className="font-medium text-slate-600 truncate max-w-[160px]">
            Espaço_de_Trabalho
          </span>
          <span className="text-slate-400">/</span>
          {isRenaming ? (
            <input
              type="text"
              value={tempName}
              onChange={e => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              className="px-1.5 py-0.5 text-xs font-semibold text-slate-900 bg-indigo-50 border border-indigo-400 rounded focus:outline-hidden"
              autoFocus
            />
          ) : (
            <span
              onClick={() => {
                setTempName(sheet.name || 'Tabela');
                setIsRenaming(true);
              }}
              title="Clique duas vezes para renomear"
              className="font-semibold text-slate-800 truncate max-w-[220px] hover:text-indigo-600 hover:bg-slate-100 px-1 py-0.5 rounded transition-colors cursor-pointer"
            >
              {sheet.name || 'Acompanhamento_de_Dados'}
            </span>
          )}
        </div>

        {/* View Switcher Tabs (Dados vs Relacionamentos vs Painel BI) */}
        <div className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 ml-2">
          <button
            onClick={() => onSelectView('spreadsheet')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="size-3.5 text-indigo-600" />
            <span>Dados</span>
          </button>

          <button
            onClick={() => onSelectView('relations')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeView === 'relations'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="size-3.5 text-indigo-600" />
            <span>Relacionamentos</span>
          </button>

          <button
            onClick={() => onSelectView('powerbi')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeView === 'powerbi'
                ? 'bg-white text-emerald-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="size-3.5 text-emerald-600" />
            <span>Painel BI</span>
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
          onClick={onOpenShare}
          title="Compartilhar / Salvar Planilha"
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-xs transition-colors cursor-pointer ml-1"
        >
          <Share2 className="size-3.5" />
          <span>Compartilhar</span>
        </button>
      </div>
    </header>
  );
};
