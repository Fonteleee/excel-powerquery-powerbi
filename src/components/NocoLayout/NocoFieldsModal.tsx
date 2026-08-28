import React, { useState } from 'react';
import {
  X,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Check,
  Type,
  Hash,
  Clock,
  Calendar,
  DollarSign,
  Search,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { colIndexToLabel, cellPosToKey } from '../../engine/formulaParser';

interface NocoFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  onUpdateSheet: (sheet: Sheet) => void;
}

export const NocoFieldsModal: React.FC<NocoFieldsModalProps> = ({
  isOpen,
  onClose,
  sheet,
  onUpdateSheet,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const columns = Array.from({ length: sheet.colCount }).map((_, colIdx) => {
    const colLabel = colIndexToLabel(colIdx);
    const headerCell = sheet.data[cellPosToKey(0, colIdx)];
    const title = headerCell?.value ? String(headerCell.value) : `Coluna ${colLabel}`;
    return {
      index: colIdx,
      label: colLabel,
      title,
    };
  });

  const filteredColumns = columns.filter(c =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Gerenciar Campos</h3>
              <p className="text-xs text-slate-500">{sheet.colCount} colunas cadastradas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/30">
          <div className="relative flex items-center">
            <Search className="size-3.5 text-slate-400 absolute left-3" />
            <input
              type="text"
              placeholder="Buscar colunas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
              autoFocus
            />
          </div>
        </div>

        {/* Column List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredColumns.map(col => {
            return (
              <div
                key={col.index}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-6 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center font-mono">
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {col.title}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                  <Check className="size-3.5" />
                  <span className="text-[11px]">Visível</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500">{filteredColumns.length} de {sheet.colCount} colunas</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs transition-colors cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
