import React, { useState } from 'react';
import { Plus, X, Hash, Layers, CheckCircle } from 'lucide-react';
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

  const rangeText = `${colIndexToLabel(selectedRange.startCol)}${selectedRange.startRow + 1}:${colIndexToLabel(selectedRange.endCol)}${selectedRange.endRow + 1}`;

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

  return (
    <footer className="h-9 bg-[#0b0f19] border-t border-white/10 flex items-center justify-between px-3 text-xs select-none z-20 shadow-xs">
      {/* Sheet Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[55%] scrollbar-none py-0.5">
        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;

          return (
            <div
              key={sheet.id}
              onClick={() => onSelectSheet(sheet.id)}
              onDoubleClick={() => handleStartRename(sheet)}
              className={`group relative flex items-center gap-2 px-3 py-1 rounded-md transition-all cursor-pointer text-xs font-semibold ${
                isActive
                  ? 'bg-white/10 text-white font-bold border border-white/15 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {isActive && <div className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />}
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
                  className="w-24 px-1.5 py-0.5 bg-slate-900 border border-emerald-500 rounded text-xs text-white focus:outline-hidden font-medium"
                />
              ) : (
                <span className="truncate max-w-[140px] tracking-tight">{sheet.name}</span>
              )}

              {sheets.length > 1 && isActive && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteSheet(sheet.id);
                  }}
                  title="Excluir aba"
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded hover:bg-white/10 transition-all cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add New Sheet Button */}
        <button
          onClick={onAddSheet}
          title="Nova Planilha"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Real-time Status Metrics Bar (Linear / Apple Pro aesthetic) */}
      <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-300">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-semibold">
          <span className="text-slate-500">Ref:</span>
          <span className="text-emerald-400 font-mono font-bold">{rangeText}</span>
        </div>

        {count > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded bg-white/5 border border-white/10 tabular-nums">
            <span className="text-slate-400 text-[10px]">
              CONTAGEM: <strong className="text-white font-bold">{count}</strong>
            </span>

            {numbers.length > 0 && (
              <>
                <span className="w-px h-3 bg-white/10" />
                <span className="text-slate-400 text-[10px]">
                  MÉDIA:{' '}
                  <strong className="text-sky-400 font-bold">
                    {avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>

                <span className="w-px h-3 bg-white/10" />
                <span className="text-slate-400 text-[10px]">
                  SOMA:{' '}
                  <strong className="text-emerald-400 font-bold">
                    {sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>

                {numbers.length > 1 && (
                  <>
                    <span className="w-px h-3 bg-white/10" />
                    <span className="text-slate-400 text-[10px] hidden lg:inline">
                      MÍN/MÁX:{' '}
                      <strong className="text-slate-200 font-bold">
                        {min.toLocaleString('pt-BR')} / {max.toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
          <CheckCircle className="size-3 text-emerald-400" />
          <span>Pronto</span>
        </div>
      </div>
    </footer>
  );
};

