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
  GitBranch,
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
    <header className="h-10 bg-white border-b border-[#e2e8f0] px-3 flex items-center justify-between select-none shrink-0 z-20">
      {/* Left: Breadcrumbs & View Switcher */}
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            title="Expandir Barra Lateral"
            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}

        {/* Base Logo Indicator */}
        <div className="size-5 rounded bg-rose-600 text-white flex items-center justify-center shadow-2xs font-bold text-[10px]">
          <Box className="size-3.5" />
        </div>

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-xs text-slate-800 font-semibold">
          <span className="hover:text-slate-950 cursor-pointer">Espaço_de_Trabalho</span>
          <span className="text-slate-400">/</span>
          
          {isRenaming ? (
            <input
              type="text"
              value={tempName}
              onChange={e => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') {
                  setTempName(sheet.name || 'Tabela');
                  setIsRenaming(false);
                }
              }}
              autoFocus
              className="px-1.5 py-0.5 bg-white border border-indigo-500 rounded text-xs font-bold text-slate-900 focus:outline-hidden"
            />
          ) : (
            <span
              onClick={() => {
                setTempName(sheet.name || 'Tabela');
                setIsRenaming(true);
              }}
              title="Clique duplo para renomear"
              className="font-bold text-slate-900 hover:bg-slate-100 px-1 py-0.5 rounded cursor-pointer transition-colors truncate max-w-[200px]"
            >
              {sheet.name || 'Acompanhamento_de_Dados'}
            </span>
          )}
        </div>

        {/* View Switcher Tabs (Dados vs Relacionamentos vs Painel BI) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-2">
          <button
            onClick={() => onSelectView('spreadsheet')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all btn-tactile cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-white text-indigo-900 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <TableIcon className="size-3.5 text-indigo-600" />
            <span>Dados</span>
          </button>

          <button
            onClick={() => onSelectView('relations')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all btn-tactile cursor-pointer ${
              activeView === 'relations'
                ? 'bg-white text-indigo-900 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <GitBranch className="size-3.5 text-indigo-600" />
            <span>Relacionamentos</span>
          </button>

          <button
            onClick={() => onSelectView('powerbi')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all btn-tactile cursor-pointer ${
              activeView === 'powerbi'
                ? 'bg-white text-emerald-900 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-700 hover:text-slate-950'
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
          className="p-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors btn-tactile cursor-pointer"
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          onClick={onRedo}
          title="Refazer (Ctrl+Y)"
          className="p-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors btn-tactile cursor-pointer"
        >
          <Redo2 className="size-3.5" />
        </button>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          title="Recalcular Planilha / Atualizar"
          className="p-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors btn-tactile cursor-pointer"
        >
          <RefreshCw className="size-3.5" />
        </button>

        {/* Import CSV / XLSX */}
        <button
          onClick={onOpenImportModal}
          title="Importar Arquivo (CSV / Excel)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors btn-tactile cursor-pointer"
        >
          <Upload className="size-3.5 text-slate-700" />
          <span>Importar</span>
        </button>

        {/* Export XLSX with Formulas */}
        <button
          onClick={onExportExcel}
          title="Exportar para Excel (.XLSX)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors btn-tactile cursor-pointer"
        >
          <Download className="size-3.5 text-slate-700" />
          <span>Exportar</span>
        </button>

        {/* NocoAI Copilot Trigger - Obsidian Luxe AI Button */}
        <button
          onClick={onToggleCopilot}
          title="NocoAI Assistente Copilot"
          aria-label="Abrir assistente NocoAI"
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-violet-200 border border-violet-500/30 shadow-xs hover:shadow-violet-500/10 transition-all btn-tactile cursor-pointer ml-1 group"
        >
          <Sparkles className="size-3.5 text-violet-400 group-hover:scale-110 transition-transform" />
          <span>NocoAI</span>
        </button>

        {/* Share Button (NocoDB Signature Blue) */}
        <button
          onClick={onOpenShare}
          title="Compartilhar / Salvar Planilha"
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-xs transition-colors btn-tactile cursor-pointer ml-1"
        >
          <Share2 className="size-3.5" />
          <span>Compartilhar</span>
        </button>
      </div>
    </header>
  );
};
