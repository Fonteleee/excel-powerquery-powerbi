import React from 'react';
import {
  X,
  Clock,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';

interface NocoHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  historyPastCount: number;
  historyFutureCount: number;
  onUndo: () => void;
  onRedo: () => void;
  sheetName: string;
}

export const NocoHistoryDrawer: React.FC<NocoHistoryDrawerProps> = ({
  isOpen,
  onClose,
  historyPastCount,
  historyFutureCount,
  onUndo,
  onRedo,
  sheetName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-slate-200 shadow-2xl flex flex-col font-sans animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
            <Clock className="size-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">Histórico de Alterações</h3>
            <p className="text-[11px] text-slate-500">{sheetName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Undo / Redo Actions */}
      <div className="p-3 border-b border-slate-100 grid grid-cols-2 gap-2 bg-slate-50/30">
        <button
          onClick={onUndo}
          disabled={historyPastCount === 0}
          className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold border transition-all ${
            historyPastCount > 0
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 shadow-xs cursor-pointer'
              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
          }`}
        >
          <RotateCcw className="size-3.5" />
          <span>Desfazer ({historyPastCount})</span>
        </button>

        <button
          onClick={onRedo}
          disabled={historyFutureCount === 0}
          className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold border transition-all ${
            historyFutureCount > 0
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 shadow-xs cursor-pointer'
              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
          }`}
        >
          <RotateCw className="size-3.5" />
          <span>Refazer ({historyFutureCount})</span>
        </button>
      </div>

      {/* Timeline entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Versão Atual em Memória</div>
            <div className="text-[11px] text-slate-500">Sincronizado localmente no navegador</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Agora</div>
          </div>
        </div>

        {historyPastCount > 0 && (
          <div className="flex items-start gap-3 pl-0.5">
            <div className="size-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
              {historyPastCount}
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700">Edições no Histórico</div>
              <div className="text-[11px] text-slate-500">Disponíveis para restauração com Ctrl+Z</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
        <span className="text-[11px] text-slate-500">Pressione <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">Ctrl+Z</kbd> para desfazer</span>
      </div>
    </div>
  );
};
