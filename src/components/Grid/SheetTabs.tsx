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
    <footer className="h-9 bg-[#ffffff] border-t border-slate-200 flex items-center justify-between px-3 text-xs select-none z-20 shadow-xs">
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
                  ? 'bg-slate-100 text-slate-950 font-bold border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {isActive && <div className="size-1.5 rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(16,124,65,0.7)]" />}
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
                  className="w-24 px-1.5 py-0.5 bg-white border border-emerald-600 rounded text-xs text-slate-900 focus:outline-hidden font-medium"
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
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-600 p-0.5 rounded hover:bg-slate-200 transition-all cursor-pointer"
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
          className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Real-time Status Metrics Bar (Linear / Apple Pro aesthetic) */}
      <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-600">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
          <span className="text-slate-400">Ref:</span>
          <span className="text-emerald-800 font-mono font-bold">{rangeText}</span>
        </div>

        {count > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-50 border border-slate-200 tabular-nums">
            <span className="text-slate-500 text-[10px]">
              CONTAGEM: <strong className="text-slate-900 font-bold">{count}</strong>
            </span>

            {numbers.length > 0 && (
              <>
                <span className="w-px h-3 bg-slate-200" />
                <span className="text-slate-500 text-[10px]">
                  MÉDIA:{' '}
                  <strong className="text-sky-700 font-bold">
                    {avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>

                <span className="w-px h-3 bg-slate-200" />
                <span className="text-slate-500 text-[10px]">
                  SOMA:{' '}
                  <strong className="text-emerald-800 font-bold">
                    {sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>

                {numbers.length > 1 && (
                  <>
                    <span className="w-px h-3 bg-slate-200" />
                    <span className="text-slate-500 text-[10px] hidden lg:inline">
                      MÍN/MÁX:{' '}
                      <strong className="text-slate-700 font-bold">
                        {min.toLocaleString('pt-BR')} / {max.toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-emerald-800 text-[10px] font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
          <span className="size-1.5 rounded-full bg-emerald-600 led-live-green" />
          <span>Pronto</span>
        </div>
      </div>
    </footer>
  );
};



