import React from 'react';
import {
  X,
  Sigma,
  TrendingUp,
  Hash,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
} from 'lucide-react';
import { Sheet, CellRange } from '../../types/spreadsheet';
import { cellPosToKey, parseNumberSafely, colIndexToLabel } from '../../engine/formulaParser';

interface NocoSummaryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  selectedRange: CellRange;
}

export const NocoSummaryDrawer: React.FC<NocoSummaryDrawerProps> = ({
  isOpen,
  onClose,
  sheet,
  selectedRange,
}) => {
  if (!isOpen) return null;

  // Calculate statistics for the selected range or entire table
  const startR = selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol ? 1 : selectedRange.startRow;
  const endR = selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol ? sheet.rowCount - 1 : selectedRange.endRow;
  const startC = selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol ? 0 : selectedRange.startCol;
  const endC = selectedRange.startRow === selectedRange.endRow && selectedRange.startCol === selectedRange.endCol ? sheet.colCount - 1 : selectedRange.endCol;

  const numericValues: number[] = [];
  let filledCount = 0;
  let emptyCount = 0;

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const cell = sheet.data[cellPosToKey(r, c)];
      if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
        filledCount++;
        const num = parseNumberSafely(cell.value);
        if (num !== null) numericValues.push(num);
      } else {
        emptyCount++;
      }
    }
  }

  const sum = numericValues.reduce((a, b) => a + b, 0);
  const avg = numericValues.length > 0 ? sum / numericValues.length : 0;
  const min = numericValues.length > 0 ? Math.min(...numericValues) : 0;
  const max = numericValues.length > 0 ? Math.max(...numericValues) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl p-4 animate-in slide-in-from-bottom duration-200 font-sans">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Calculator className="size-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Resumo Estatístico</h4>
            <p className="text-[11px] text-slate-500">
              {startR === 1 && endR === sheet.rowCount - 1 ? 'Toda a Tabela' : `Intervalo ${colIndexToLabel(startC)}${startR + 1}:${colIndexToLabel(endC)}${endR + 1}`}
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="flex items-center gap-4 overflow-x-auto py-1">
          {/* SOMA */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 min-w-[130px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sigma className="size-3 text-indigo-500" />
              Soma
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 tabular-nums truncate">
              {sum.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* MÉDIA */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 min-w-[130px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="size-3 text-emerald-500" />
              Média
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 tabular-nums truncate">
              {avg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* MÍNIMO */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 min-w-[110px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowDownRight className="size-3 text-rose-500" />
              Mínimo
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 tabular-nums truncate">
              {min.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* MÁXIMO */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 min-w-[110px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="size-3 text-emerald-500" />
              Máximo
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 tabular-nums truncate">
              {max.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* CONTAGEM */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 min-w-[110px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Hash className="size-3 text-blue-500" />
              Contagem
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 tabular-nums truncate">
              {filledCount}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="size-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
};
