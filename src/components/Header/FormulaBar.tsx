import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
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
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentCellKey = cellPosToKey(activeCell.row, activeCell.col);
  const currentCell = sheet.data[currentCellKey];

  useEffect(() => {
    setInputValue(currentCell?.raw || '');
  }, [currentCell, activeCell]);

  const hasRange =
    selectedRange.startRow !== selectedRange.endRow ||
    selectedRange.startCol !== selectedRange.endCol;

  const addressText = hasRange ? rangeToAddress(selectedRange) : cellPosToAddress(activeCell);
  const isFormula = inputValue.startsWith('=');
  const evaluatedDisplay = currentCell ? formatCellValue(currentCell.value, currentCell.format) : '';

  // Name Box Jump State
  const [nameBoxValue, setNameBoxValue] = useState(addressText);
  const [isNameBoxEditing, setIsNameBoxEditing] = useState(false);

  useEffect(() => {
    if (!isNameBoxEditing) {
      setNameBoxValue(addressText);
    }
  }, [addressText, isNameBoxEditing]);

  const handleNameBoxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = nameBoxValue.trim().toUpperCase();
      const range = parseRangeAddress(trimmed, sheet.rowCount);
      if (range) {
        if (onSelectCell) onSelectCell({ row: range.startRow, col: range.startCol });
        if (onSelectRange) onSelectRange(range);
      } else {
        const cell = parseCellAddress(trimmed);
        if (cell) {
          if (onSelectCell) onSelectCell(cell);
          if (onSelectRange) onSelectRange({ startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col });
        }
      }
      setIsNameBoxEditing(false);
    } else if (e.key === 'Escape') {
      setNameBoxValue(addressText);
      setIsNameBoxEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onCommitFormula(inputValue);
      setIsFocused(false);
    } else if (e.key === 'Escape') {
      setInputValue(currentCell?.raw || '');
      setIsFocused(false);
    }
  };

  const handleSelectFormula = (completedText: string) => {
    setInputValue(completedText);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="h-7 bg-[#f5f5f5] border-b border-[#e0e0e0] flex items-center px-2 gap-1.5 select-none z-20 relative font-sans">
      {/* Name Box (Interactive Cell Jump Input) */}
      <div
        title="Caixa de Nome: Digite uma célula (ex: B10, A1:D5) e pressione Enter para navegar"
        className="w-22 h-5.5 px-1.5 bg-white border border-[#e0e0e0] rounded-xs flex items-center justify-between text-xs text-[#242424] font-sans shadow-2xs hover:border-[#b0b0b0] focus-within:border-[#107c41] focus-within:ring-1 focus-within:ring-[#107c41]/30"
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
          className="w-full text-xs font-sans font-semibold text-[#242424] uppercase bg-transparent focus:outline-hidden"
        />
        <span className="text-[10px] text-[#707070] scale-75 shrink-0 pointer-events-none">▼</span>
      </div>

      {/* Cancel / Commit buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => {
            setInputValue(currentCell?.raw || '');
            setIsFocused(false);
          }}
          title="Cancelar (Esc)"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded text-[#707070] hover:text-rose-600 hover:bg-[#ebebeb] disabled:opacity-20 transition-colors cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
        <button
          onClick={() => {
            onCommitFormula(inputValue);
            setIsFocused(false);
          }}
          title="Confirmar (Enter)"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded text-[#707070] hover:text-[#107c41] hover:bg-[#ebebeb] disabled:opacity-20 transition-colors cursor-pointer"
        >
          <Check className="size-3.5" />
        </button>
      </div>

      {/* FX Insert Function Button */}
      <button
        onClick={onOpenFormulaWizard}
        title="Assistente de Funções (fx)"
        className="px-1.5 h-5.5 rounded-xs hover:bg-[#ebebeb] text-[#505050] hover:text-[#107c41] flex items-center gap-1 cursor-pointer"
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
          placeholder=""
          className={`w-full h-5.5 px-2 bg-white border rounded-xs text-xs font-sans text-[#242424] focus:outline-hidden transition-colors ${
            isFocused
              ? 'border-[#107c41] ring-1 ring-[#107c41]'
              : 'border-[#e0e0e0] hover:border-[#b0b0b0]'
          }`}
        />

        {/* Live Evaluated Preview Pill */}
        {isFormula && evaluatedDisplay && !isFocused && (
          <div className="absolute right-2 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] text-[#707070] font-sans">Resultado:</span>
            <span className="text-xs font-sans font-bold text-[#107c41] bg-[#dff6dd] px-1.5 py-0.2 rounded border border-[#c8e6c9]">
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





