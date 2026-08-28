import React, { useState } from 'react';
import { Plus, X, Hash, Layers, CheckCircle, Copy, Check } from 'lucide-react';
import { Sheet, CellRange } from '../../types/spreadsheet';
import { getFlatRangeValues, parseNumberSafely, colIndexToLabel } from '../../engine/formulaParser';

interface SheetTabsProps {
  sheets: Sheet[];
  activeSheetId: string;
  selectedRange: CellRange;
  onSelectSheet: (id: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (id: string, newName: string) => void;
  onDuplicateSheet: (id: string) => void;
  onDeleteSheet: (id: string) => void;
}

export const SheetTabs: React.FC<SheetTabsProps> = ({
  sheets,
  activeSheetId,
  selectedRange,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
}) => {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copiedStat, setCopiedStat] = useState<string | null>(null);

  const currentSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  const flatVals = currentSheet ? getFlatRangeValues(currentSheet, selectedRange) : [];
  const numbers = flatVals
    .map(v => parseNumberSafely(v))
    .filter((n): n is number => n !== null);

  const sum = numbers.reduce((a, b) => a + b, 0);
  const avg = numbers.length > 0 ? sum / numbers.length : 0;
  const min = numbers.length > 0 ? Math.min(...numbers) : 0;
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  const count = flatVals.filter(v => v !== null && v !== undefined && v !== '').length;

  const handleStartRename = (sheet: Sheet) => {
    setEditingSheetId(sheet.id);
    setRenameValue(sheet.name);
  };

  const handleCommitRename = (id: string) => {
    if (renameValue.trim()) {
      onRenameSheet(id, renameValue.trim());
    }
    setEditingSheetId(null);
  };

  const handleCopyStat = (label: string, value: number | string) => {
    navigator.clipboard.writeText(String(value));
    setCopiedStat(label);
    setTimeout(() => setCopiedStat(null), 1800);
  };

  return (
    <footer className="h-8 bg-slate-100 border-t border-slate-200/90 flex items-center justify-between px-2 text-xs font-sans select-none z-20 shadow-xs">
      {/* Left: Sheet Navigation & Sheet Tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto max-w-[55%] scrollbar-none h-full py-0.5">
        {/* Add New Sheet Button */}
        <button
          onClick={onAddSheet}
          title="Nova Planilha (+)"
          className="flex items-center justify-center size-6 rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer mr-1"
        >
          <Plus className="size-3.5" />
        </button>

        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;

          return (
            <div
              key={sheet.id}
              onClick={() => onSelectSheet(sheet.id)}
              onDoubleClick={() => handleStartRename(sheet)}
              className={`group relative flex items-center gap-1.5 px-3.5 h-full transition-all cursor-pointer text-xs rounded-t-lg ${
                isActive
                  ? 'bg-white text-emerald-800 font-bold border-t-2 border-t-emerald-600 border-x border-slate-200/80 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70 border-r border-slate-200/40'
              }`}
            >
              {editingSheetId === sheet.id ? (
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleCommitRename(sheet.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCommitRename(sheet.id);
                    if (e.key === 'Escape') setEditingSheetId(null);
                  }}
                  className="w-24 px-1.5 py-0.5 bg-white border border-emerald-600 rounded text-xs text-slate-800 focus:outline-none font-semibold"
                />
              ) : (
                <span className="truncate max-w-[140px]">{sheet.name}</span>
              )}

              {sheets.length > 1 && isActive && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteSheet(sheet.id);
                  }}
                  title="Excluir aba"
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-600 p-0.5 rounded hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: Excel Smart Data Profiler Status Bar */}
      <div className="flex items-center gap-2 text-xs text-slate-600 font-sans">
        <span className="text-[11px] text-slate-400 font-medium">Pronto</span>

        {count > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-700 tabular-nums bg-white/90 px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs">
            {numbers.length > 1 && (
              <>
                <button
                  onClick={() => handleCopyStat('avg', avg)}
                  title="Clique para copiar a MÉDIA"
                  className="hover:text-emerald-700 cursor-pointer transition-colors"
                >
                  MÉDIA: <strong className="font-semibold">{avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </button>
                <span className="text-slate-300">|</span>
              </>
            )}

            <span title="Contagem de células preenchidas">
              CONTAGEM: <strong className="font-semibold">{count}</strong>
            </span>

            {numbers.length > 1 && (
              <>
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => handleCopyStat('min', min)}
                  title="Clique para copiar o MÍNIMO"
                  className="hover:text-emerald-700 cursor-pointer transition-colors"
                >
                  MÍN: <strong className="font-semibold">{min.toLocaleString('pt-BR')}</strong>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => handleCopyStat('max', max)}
                  title="Clique para copiar o MÁXIMO"
                  className="hover:text-emerald-700 cursor-pointer transition-colors"
                >
                  MÁX: <strong className="font-semibold">{max.toLocaleString('pt-BR')}</strong>
                </button>
              </>
            )}

            {numbers.length > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => handleCopyStat('sum', sum)}
                  title="Clique para copiar a SOMA TOTAL"
                  className="hover:text-emerald-700 cursor-pointer transition-colors font-bold text-emerald-800 flex items-center gap-1"
                >
                  {copiedStat === 'sum' ? <Check className="size-3 text-emerald-600" /> : null}
                  <span>SOMA: {sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Zoom Level Indicator */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 pl-2 border-l border-slate-300">
          <span>100%</span>
        </div>
      </div>
    </footer>
  );
};
