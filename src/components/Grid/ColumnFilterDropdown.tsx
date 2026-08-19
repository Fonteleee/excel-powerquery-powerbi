import React, { useState, useMemo } from 'react';
import { Filter, ArrowDownAZ, ArrowUpZA, Search, Check, X, RotateCcw } from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { cellPosToKey, getCellValue, colIndexToLabel, parseNumberSafely } from '../../engine/formulaParser';

interface ColumnFilterDropdownProps {
  colIndex: number;
  colName: string;
  sheet: Sheet;
  selectedValues: string[] | undefined;
  isOpen: boolean;
  onClose: () => void;
  onApplyFilter: (colIndex: number, selectedValues: string[] | null) => void;
  onSortColumn: (colIndex: number, direction: 'asc' | 'desc') => void;
}

export const ColumnFilterDropdown: React.FC<ColumnFilterDropdownProps> = ({
  colIndex,
  colName,
  sheet,
  selectedValues,
  isOpen,
  onClose,
  onApplyFilter,
  onSortColumn,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Extract all distinct values in this column (excluding row 0 header)
  const distinctValues = useMemo(() => {
    const set = new Set<string>();
    for (let r = 1; r < sheet.rowCount; r++) {
      const val = getCellValue(sheet, r, colIndex);
      const strVal = val !== null && val !== undefined && val !== '' ? String(val).trim() : '(Vazio)';
      set.add(strVal);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [sheet, colIndex]);

  // Selected values state (if undefined, all are selected)
  const [checkedValues, setCheckedValues] = useState<Set<string>>(() => {
    return new Set(selectedValues !== undefined ? selectedValues : distinctValues);
  });

  // Filtered list by search term
  const visibleDistinctValues = useMemo(() => {
    if (!searchTerm.trim()) return distinctValues;
    const q = searchTerm.toLowerCase();
    return distinctValues.filter(v => v.toLowerCase().includes(q));
  }, [distinctValues, searchTerm]);

  const isAllChecked = distinctValues.length > 0 && distinctValues.every(v => checkedValues.has(v));
  const isSomeChecked = distinctValues.some(v => checkedValues.has(v)) && !isAllChecked;

  const handleToggleAll = () => {
    if (isAllChecked) {
      setCheckedValues(new Set());
    } else {
      setCheckedValues(new Set(distinctValues));
    }
  };

  const handleToggleValue = (val: string) => {
    setCheckedValues(prev => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  };

  const handleApply = () => {
    if (checkedValues.size === distinctValues.length) {
      // All selected = no active filter needed
      onApplyFilter(colIndex, null);
    } else {
      onApplyFilter(colIndex, Array.from(checkedValues));
    }
    onClose();
  };

  const handleClear = () => {
    setCheckedValues(new Set(distinctValues));
    onApplyFilter(colIndex, null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="absolute top-7 left-0 z-50 w-64 bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden text-xs font-sans text-slate-800 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header Sort Actions */}
      <div className="p-2 border-b border-slate-100 bg-slate-50 space-y-1">
        <button
          onClick={() => {
            onSortColumn(colIndex, 'asc');
            onClose();
          }}
          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-200/80 flex items-center gap-2 text-slate-700 font-semibold transition-colors cursor-pointer text-left"
        >
          <ArrowDownAZ className="size-3.5 text-emerald-700" />
          <span>Classificar de A a Z (Crescente)</span>
        </button>

        <button
          onClick={() => {
            onSortColumn(colIndex, 'desc');
            onClose();
          }}
          className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-200/80 flex items-center gap-2 text-slate-700 font-semibold transition-colors cursor-pointer text-left"
        >
          <ArrowUpZA className="size-3.5 text-emerald-700" />
          <span>Classificar de Z a A (Decrescente)</span>
        </button>

        {selectedValues && selectedValues.length < distinctValues.length && (
          <button
            onClick={handleClear}
            className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-700 flex items-center gap-2 font-semibold transition-colors cursor-pointer text-left"
          >
            <RotateCcw className="size-3.5 text-rose-600" />
            <span>Limpar Filtro desta Coluna</span>
          </button>
        )}
      </div>

      {/* Search within values */}
      <div className="p-2.5 border-b border-slate-200 space-y-2">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar itens..."
            className="w-full h-7 pl-7 pr-2 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden"
          />
          <Search className="absolute left-2 top-2 size-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Checkbox List for Multiple Selection */}
      <div className="p-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin select-none">
        {/* Select All */}
        <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer font-bold text-slate-800">
          <input
            type="checkbox"
            checked={isAllChecked}
            ref={el => {
              if (el) el.indeterminate = isSomeChecked;
            }}
            onChange={handleToggleAll}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <span>(Selecionar Tudo)</span>
        </label>

        {/* Distinct Values */}
        {visibleDistinctValues.map((val, idx) => {
          const isChecked = checkedValues.has(val);
          return (
            <label
              key={idx}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer text-slate-700 text-[11px]"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggleValue(val)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="truncate">{val}</span>
            </label>
          );
        })}

        {visibleDistinctValues.length === 0 && (
          <div className="py-2 text-center text-slate-400 text-xs italic">
            Nenhum item encontrado
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <button
          onClick={handleClear}
          className="px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          Limpar
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            className="px-3.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};
