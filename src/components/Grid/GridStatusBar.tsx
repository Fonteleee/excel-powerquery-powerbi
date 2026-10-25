// src/components/Grid/GridStatusBar.tsx
// Barra inferior da grade: novo registro, contagem, resumo e atalho do assistente.

import { ChevronDown, Plus, Sparkles } from 'lucide-react';

export interface GridStatusBarProps {
  recordCount: number;
  onAddRow: () => void;
  onSummary: () => void;
  onToggleCopilot?: () => void;
}

export function GridStatusBar({ recordCount, onAddRow, onSummary, onToggleCopilot }: GridStatusBarProps) {
  return (
      <div className="h-8 shrink-0 bg-[#f8fafc] border-t border-[#e2e8f0] px-3 flex items-center justify-between text-xs text-slate-600 select-none z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onAddRow}
            className="flex items-center gap-1 font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-200/60 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            <Plus className="size-3.5 text-slate-500" />
            <span>Novo Registro</span>
          </button>

          <span className="text-slate-300">|</span>

          <span className="text-slate-500 font-sans">
            {recordCount} registros
          </span>

          <span className="text-slate-300">|</span>

          <button
            onClick={onSummary}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 px-1.5 py-0.5 rounded hover:bg-slate-200/50 cursor-pointer"
          >
            <ChevronDown className="size-3 text-slate-400" />
            <span>Resumo</span>
          </button>
        </div>

        {/* Botão do assistente de IA, canto inferior direito */}
        {onToggleCopilot && (
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleCopilot}
              aria-label="Abrir assistente de IA"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-900 text-violet-200 border border-violet-500/40 font-bold text-xs shadow-lg backdrop-blur-xs hover:shadow-violet-500/20 hover:scale-105 btn-tactile cursor-pointer"
            >
              <Sparkles className="size-3.5 text-violet-400 animate-pulse" />
              <span>IA</span>
            </button>
          </div>
        )}
      </div>
  );
}
