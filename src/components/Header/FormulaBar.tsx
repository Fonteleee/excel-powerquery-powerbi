import React, { useState, useEffect, useRef } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { CellPosition, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToAddress, cellPosToKey, rangeToAddress, formatCellValue, parseRangeAddress, parseCellAddress } from '../../engine/formulaParser';
import { FormulaAutocomplete } from '../Grid/FormulaAutocomplete';

interface FormulaBarProps {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  onCommitFormula: (formula: string) => void;
  onOpenFormulaWizard: () => void;
  onSelectCell?: (pos: CellPosition) => void;
  onSelectRange?: (range: CellRange) => void;
}

export const FormulaBar: React.FC<FormulaBarProps> = ({
  sheet,
  activeCell,
  selectedRange,
  onCommitFormula,
  onOpenFormulaWizard,
  onSelectCell,
  onSelectRange,
}) => {
  const isMultiCell =
    selectedRange.startRow !== selectedRange.endRow ||
    selectedRange.startCol !== selectedRange.endCol;

  const addressText = isMultiCell
    ? rangeToAddress(selectedRange)
    : cellPosToAddress(activeCell);

  const currentCellKey = cellPosToKey(activeCell.row, activeCell.col);
  const currentCell = sheet.data[currentCellKey];

  const [inputValue, setInputValue] = useState(currentCell?.raw || '');
  const [nameBoxValue, setNameBoxValue] = useState(addressText);
  const [isFocused, setIsFocused] = useState(false);
  const [isNameBoxEditing, setIsNameBoxEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with active cell changes
  useEffect(() => {
    setInputValue(currentCell?.raw || '');
  }, [currentCellKey, currentCell?.raw]);

  // Sync address text
  useEffect(() => {
    if (!isNameBoxEditing) {
      setNameBoxValue(addressText);
    }
  }, [addressText, isNameBoxEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommitFormula(inputValue);
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(currentCell?.raw || '');
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  const isFormula = inputValue.startsWith('=');
  const evaluatedDisplay = currentCell ? formatCellValue(currentCell.value) : '';

  const handleNameBoxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawTarget = nameBoxValue.trim().toUpperCase();
      const range = parseRangeAddress(rawTarget);
      if (range) {
        onSelectRange?.(range);
        onSelectCell?.({ row: range.startRow, col: range.startCol });
      } else {
        const cell = parseCellAddress(rawTarget);
        if (cell) {
          onSelectCell?.(cell);
        }
      }
      setIsNameBoxEditing(false);
    } else if (e.key === 'Escape') {
      setNameBoxValue(addressText);
      setIsNameBoxEditing(false);
    }
  };

  const handleSelectFormula = (completedText: string) => {
    setInputValue(completedText);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="h-8 bg-white border-b border-[#e2e8f0] flex items-center px-3 gap-2 select-none z-20 relative font-sans">
      {/* Name Box (Interactive Cell Jump Input) */}
      <div
        title="Caixa de Nome: Digite uma célula (ex: B10, A1:D5) e pressione Enter para navegar"
        className="w-24 h-6 px-2 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between text-xs text-slate-800 font-mono shadow-2xs hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20"
      >
        <input
          type="text"
          value={nameBoxValue}
          onFocus={() => setIsNameBoxEditing(true)}
          onBlur={() => {
            setIsNameBoxEditing(false);
            setNameBoxValue(addressText);
          }}
          onChange={e => setNameBoxValue(e.target.value.toUpperCase())}
          onKeyDown={handleNameBoxKeyDown}
          className="w-full text-xs font-mono font-bold text-slate-900 uppercase bg-transparent focus:outline-hidden"
        />
        <ChevronDown className="size-3 text-slate-400 shrink-0 pointer-events-none" />
      </div>

      {/* Cancel / Commit buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => {
            setInputValue(currentCell?.raw || '');
            setIsFocused(false);
          }}
          title="Cancelar (Esc)"
          aria-label="Cancelar edição"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 disabled:opacity-20 transition-colors btn-tactile cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
        <button
          onClick={() => {
            onCommitFormula(inputValue);
            setIsFocused(false);
          }}
          title="Confirmar (Enter)"
          aria-label="Confirmar fórmula"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-slate-100 disabled:opacity-20 transition-colors btn-tactile cursor-pointer"
        >
          <Check className="size-3.5" />
        </button>
      </div>

      {/* FX Insert Function Button */}
      <button
        onClick={onOpenFormulaWizard}
        title="Assistente de Funções (fx)"
        aria-label="Abrir assistente de fórmulas"
        className="px-2 h-6 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-1 btn-tactile cursor-pointer"
      >
        <span className="font-serif italic font-bold text-xs">fx</span>
      </button>

      {/* Formula Input Container */}
      <div className="flex-1 relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onFocus={() => setIsFocused(true)}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Insira um valor ou fórmula começando com ="
          className={`w-full h-6 px-2.5 bg-slate-50/60 border rounded-md text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden transition-colors ${
            isFocused
              ? 'border-indigo-500 ring-1 ring-indigo-500/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        />

        {/* Live Evaluated Preview Pill */}
        {isFormula && evaluatedDisplay && !isFocused && (
          <div className="absolute right-2 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] text-slate-500 font-sans">Resultado:</span>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
              {evaluatedDisplay}
            </span>
          </div>
        )}

        {/* Formula Autocomplete Dropdown */}
        {isFocused && isFormula && (
          <FormulaAutocomplete
            input={inputValue}
            onSelectFormula={handleSelectFormula}
            className="left-0 top-full mt-1 absolute"
          />
        )}
      </div>
    </div>
  );
};





