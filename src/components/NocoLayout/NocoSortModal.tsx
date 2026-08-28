import React, { useState } from 'react';
import {
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { colIndexToLabel, cellPosToKey, parseNumberSafely, recalculateSheet } from '../../engine/formulaParser';

interface NocoSortModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  onUpdateSheet: (sheet: Sheet) => void;
}

export const NocoSortModal: React.FC<NocoSortModalProps> = ({
  isOpen,
  onClose,
  sheet,
  onUpdateSheet,
}) => {
  const [selectedCol, setSelectedCol] = useState<number>(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  if (!isOpen) return null;

  const handleApplySort = () => {
    // Preserve header row 0, sort rows 1 to rowCount - 1
    const rowsToSort: { rowIdx: number; val: any }[] = [];

    for (let r = 1; r < sheet.rowCount; r++) {
      const cellVal = sheet.data[cellPosToKey(r, selectedCol)]?.value;
      rowsToSort.push({ rowIdx: r, val: cellVal });
    }

    rowsToSort.sort((a, b) => {
      const numA = parseNumberSafely(a.val);
      const numB = parseNumberSafely(b.val);

      if (numA !== null && numB !== null) {
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }
      const strA = String(a.val ?? '').toLowerCase();
      const strB = String(b.val ?? '').toLowerCase();
      return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    const newData: typeof sheet.data = {};
    // Copy row 0 (headers)
    for (let c = 0; c < sheet.colCount; c++) {
      const k = cellPosToKey(0, c);
      if (sheet.data[k]) newData[k] = { ...sheet.data[k] };
    }

    // Re-map sorted rows
    rowsToSort.forEach((sortedItem, newRowOffset) => {
      const newRowIdx = newRowOffset + 1;
      const oldRowIdx = sortedItem.rowIdx;
      for (let c = 0; c < sheet.colCount; c++) {
        const oldKey = cellPosToKey(oldRowIdx, c);
        const oldCell = sheet.data[oldKey];
        if (oldCell) {
          newData[cellPosToKey(newRowIdx, c)] = { ...oldCell };
        }
      }
    });

    const recalculated = recalculateSheet({ ...sheet, data: newData });
    onUpdateSheet(recalculated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <ArrowUpDown className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Ordenar Registros</h3>
              <p className="text-xs text-slate-500">Selecione o campo para ordenação</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Coluna para Ordenar</label>
            <select
              value={selectedCol}
              onChange={e => setSelectedCol(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-slate-800 font-medium"
            >
              {Array.from({ length: sheet.colCount }).map((_, c) => {
                const header = sheet.data[cellPosToKey(0, c)]?.value;
                const label = header ? String(header) : `Coluna ${colIndexToLabel(c)}`;
                return (
                  <option key={c} value={c}>
                    {colIndexToLabel(c)} - {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Direção</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSortOrder('asc')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  sortOrder === 'asc'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUp className="size-4 text-indigo-600" />
                <span>Crescente (A-Z / 0-9)</span>
              </button>

              <button
                type="button"
                onClick={() => setSortOrder('desc')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  sortOrder === 'desc'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDown className="size-4 text-indigo-600" />
                <span>Decrescente (Z-A / 9-0)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors font-medium cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleApplySort}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="size-3.5" />
            <span>Aplicar Ordenação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
