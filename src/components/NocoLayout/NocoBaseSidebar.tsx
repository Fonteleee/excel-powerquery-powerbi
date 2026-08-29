import React, { useState } from 'react';
import {
  Box,
  Search,
  ChevronsLeft,
  Plus,
  Table as TableIcon,
  LayoutDashboard,
  GitBranch,
  MoreHorizontal,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';

interface NocoBaseSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  onNewSheet: () => void;
  activeView: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations';
  onSelectView: (view: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations') => void;
}

export const NocoBaseSidebar: React.FC<NocoBaseSidebarProps> = ({
  isOpen,
  onToggle,
  sheets,
  activeSheetId,
  onSelectSheet,
  onNewSheet,
  activeView,
  onSelectView,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  if (!isOpen) {
    return null;
  }

  const filteredSheets = sheets.filter(s =>
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside className="w-56 h-full bg-white border-r border-[#e2e8f0] flex flex-col font-sans select-none shrink-0 z-20">
      {/* Header with Base Name & Search */}
      <div className="h-12 px-3 border-b border-[#f1f5f9] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 cursor-pointer hover:bg-slate-50 p-1 rounded-md transition-colors">
          <div className="size-4.5 rounded bg-rose-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
            <Box className="size-3" />
          </div>
          <span className="font-semibold text-xs text-slate-800 truncate">Base</span>
          <ChevronDown className="size-3 text-slate-400 shrink-0" />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="Pesquisar tabelas"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Search className="size-3.5" />
          </button>
          <button
            onClick={onToggle}
            title="Ocultar barra lateral"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronsLeft className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Optional Search input */}
      {isSearchOpen && (
        <div className="px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
          <input
            type="text"
            placeholder="Buscar tabelas..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-hidden focus:border-indigo-500"
            autoFocus
          />
        </div>
      )}

      {/* Create New Button */}
      <div className="p-2 border-b border-slate-100">
        <button
          onClick={onNewSheet}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>Criar Nova Tabela</span>
        </button>
      </div>

      {/* Tables and Views Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;
          const cleanName = sheet.name || 'Tabela';

          return (
            <div key={sheet.id} className="space-y-0.5">
              {/* Table Root Item */}
              <div
                onClick={() => {
                  onSelectSheet(sheet.id);
                  onSelectView('spreadsheet');
                }}
                className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                  isActive && activeView === 'spreadsheet'
                    ? 'bg-indigo-50/80 text-indigo-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TableIcon className={`size-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="truncate">{cleanName}</span>
                </div>
                <MoreHorizontal className="size-3.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity" />
              </div>

              {/* Sub-views (Grid, Relational Diagram, PowerBI Dashboard, Power Query) when Table is Active */}
              {isActive && (
                <div className="pl-4 space-y-0.5 pt-0.5 border-l border-slate-200 ml-3">
                  <button
                    onClick={() => onSelectView('spreadsheet')}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      activeView === 'spreadsheet'
                        ? 'bg-indigo-100/70 text-indigo-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <TableIcon className="size-3 text-indigo-500" />
                    <span className="truncate">{cleanName} (Grid)</span>
                  </button>

                  <button
                    onClick={() => onSelectView('relations')}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      activeView === 'relations'
                        ? 'bg-indigo-100/70 text-indigo-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="size-3 text-indigo-500" />
                    <span className="truncate">Relacionamentos</span>
                  </button>

                  <button
                    onClick={() => onSelectView('powerbi')}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      activeView === 'powerbi'
                        ? 'bg-indigo-100/70 text-indigo-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <LayoutDashboard className="size-3 text-emerald-500" />
                    <span className="truncate">Painel Analítico (BI)</span>
                  </button>

                  <button
                    onClick={() => onSelectView('powerquery')}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      activeView === 'powerquery'
                        ? 'bg-indigo-100/70 text-indigo-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <GitBranch className="size-3 text-purple-500" />
                    <span className="truncate">Power Query (ETL)</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
