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
    <div className="h-9 bg-[#ffffff] border-b border-slate-200 flex items-center px-4 gap-2 select-none z-20 relative">
      {/* Name Box (Address) - Precision Light Box */}
      <div
        title={`Célula Ativa: ${addressText}`}
        className="w-24 h-6 px-2 bg-slate-50 border border-slate-300 rounded-md flex items-center justify-center font-mono text-xs font-bold text-emerald-800 shadow-2xs select-all"
      >
        <span className="font-mono tracking-wider">{addressText}</span>
      </div>

      <div className="h-4 w-px bg-slate-200 mx-0.5" />

      {/* Cancel / Commit buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => {
            setInputValue(currentCell?.raw || '');
            setIsFocused(false);
          }}
          title="Cancelar (Esc)"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-20 transition-colors cursor-pointer"
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
          className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-20 transition-colors cursor-pointer"
        >
          <Check className="size-3.5" />
        </button>
      </div>

      {/* FX Insert Function Button */}
      <button
        onClick={onOpenFormulaWizard}
        title="Assistente de Funções (fx)"
        className="px-2.5 h-6 rounded-md bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-300 hover:border-emerald-500 transition-all flex items-center gap-1 cursor-pointer group shadow-2xs"
      >
        <span className="font-serif italic font-bold text-xs text-slate-600 group-hover:text-emerald-700">fx</span>
      </button>

      <div className="h-4 w-px bg-slate-200 mx-0.5" />

      {/* Formula Input Container */}
      <div className="flex-1 relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onFocus={() => setIsFocused(true)}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite um valor ou fórmula iniciando com = (ex: =PROCX, =SOMA, =SOMARPRODUTO...)"
          className={`w-full h-6 px-3 bg-white border rounded-md text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-hidden transition-all shadow-2xs ${
            isFormula
              ? 'border-emerald-600 ring-1 ring-emerald-500/30 text-slate-950 font-medium'
              : 'border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-200'
          }`}
        />

        {/* Live Evaluated Preview Pill */}
        {isFormula && evaluatedDisplay && !isFocused && (
          <div className="absolute right-2.5 flex items-center gap-1.5 pointer-events-none">
            <span className="text-[10px] text-slate-400 font-sans font-medium">Resultado:</span>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shadow-2xs">
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



