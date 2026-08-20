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
    <footer className="h-7.5 bg-[#f3f2f1] border-t border-[#edebe9] flex items-center justify-between px-2 text-xs font-sans select-none z-20">
      {/* Left: Sheet Navigation & Sheet Tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto max-w-[55%] scrollbar-none h-full">
        {/* Add New Sheet Button */}
        <button
          onClick={onAddSheet}
          title="Nova Planilha (+)"
          className="p-1 rounded hover:bg-[#edebe9] text-[#605e5c] hover:text-[#201f1e] transition-colors cursor-pointer mr-1"
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
              className={`group relative flex items-center gap-1.5 px-3 h-full transition-all cursor-pointer text-xs ${
                isActive
                  ? 'bg-white text-[#107c41] font-semibold border-b-2 border-b-[#107c41] border-x border-[#edebe9] shadow-2xs'
                  : 'text-[#201f1e] hover:bg-[#edebe9] border-r border-[#edebe9]'
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
                  className="w-20 px-1 py-0.5 bg-white border border-[#107c41] rounded-xs text-xs text-[#201f1e] focus:outline-hidden font-medium"
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
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-600 p-0.5 rounded hover:bg-[#edebe9] transition-all cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: Excel Online Real-Time Status Bar */}
      <div className="flex items-center gap-3 text-xs text-[#605e5c] font-sans">
        <span className="text-[11px] text-[#605e5c]">Pronto</span>

        {count > 0 && (
          <div className="flex items-center gap-2.5 text-xs text-[#201f1e] tabular-nums">
            {numbers.length > 0 && (
              <>
                <span>
                  MÉDIA:{' '}
                  <strong>
                    {avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
                <span className="text-[#c8c6c4]">|</span>
              </>
            )}

            <span>
              CONTAGEM: <strong>{count}</strong>
            </span>

            {numbers.length > 0 && (
              <>
                <span className="text-[#c8c6c4]">|</span>
                <span>
                  SOMA:{' '}
                  <strong>
                    {sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
              </>
            )}
          </div>
        )}

        {/* Zoom Level */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#605e5c] pl-2 border-l border-[#edebe9]">
          <span>100%</span>
        </div>
      </div>
    </footer>
  );
};




