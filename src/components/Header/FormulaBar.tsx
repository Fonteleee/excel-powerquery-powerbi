import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { CellPosition, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToAddress, cellPosToKey, rangeToAddress, formatCellValue } from '../../engine/formulaParser';
import { FormulaAutocomplete } from '../Grid/FormulaAutocomplete';

interface FormulaBarProps {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  onCommitFormula: (formula: string) => void;
  onOpenFormulaWizard: () => void;
}

export const FormulaBar: React.FC<FormulaBarProps> = ({
  sheet,
  activeCell,
  selectedRange,
  onCommitFormula,
  onOpenFormulaWizard,
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
      {/* Name Box (Address with Chevron as in Image 2) */}
      <div
        title={`Célula Ativa: ${addressText}`}
        className="w-20 h-5.5 px-2 bg-white border border-[#e0e0e0] rounded-xs flex items-center justify-between text-xs text-[#242424] font-sans select-all shadow-2xs cursor-pointer hover:border-[#b0b0b0]"
      >
        <span className="font-sans font-normal text-xs">{addressText}</span>
        <span className="text-[10px] text-[#707070] scale-75">▼</span>
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
      </div>

      {/* Formula Autocomplete Dropdown */}
      {isFocused && isFormula && (
        <FormulaAutocomplete
          input={inputValue}
          onSelectFormula={handleSelectFormula}
        />
      )}
    </div>
  );
};





