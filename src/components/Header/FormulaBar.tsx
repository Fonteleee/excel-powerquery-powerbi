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
    <div className="h-8 bg-white border-b border-slate-200 flex items-center px-3 gap-2 select-none z-20 relative">
      {/* Name Box (Address) */}
      <div
        title={`Célula Ativa: ${addressText}`}
        className="w-24 h-6 px-2 bg-slate-50 border border-slate-300 rounded-xs flex items-center justify-center font-mono text-[11px] font-bold text-slate-700 select-all"
      >
        {addressText}
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* Cancel / Commit buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => {
            setInputValue(currentCell?.raw || '');
            setIsFocused(false);
          }}
          title="Cancelar (Esc)"
          disabled={inputValue === (currentCell?.raw || '')}
          className="p-1 rounded-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-colors cursor-pointer"
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
          className="p-1 rounded-xs text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <Check className="size-3.5" />
        </button>
      </div>

      {/* FX Insert Function Button */}
      <button
        onClick={onOpenFormulaWizard}
        title="Inserir Função (fx) — PROCX, SOMARPRODUTO, SEERRO, ÍNDICE..."
        className="px-2 h-6 rounded-xs bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-300 hover:border-emerald-500 transition-colors flex items-center gap-1 cursor-pointer group"
      >
        <span className="font-serif italic font-bold text-xs text-slate-600 group-hover:text-emerald-700">fx</span>
      </button>

      <div className="h-4 w-px bg-slate-200" />

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
          className={`w-full h-6 px-2.5 bg-white border rounded-xs text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-hidden transition-colors ${
            isFormula
              ? 'border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-950 font-medium'
              : 'border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-400'
          }`}
        />

        {/* Live Evaluated Preview Pill */}
        {isFormula && evaluatedDisplay && !isFocused && (
          <div className="absolute right-2 flex items-center gap-1.5 pointer-events-none">
            <span className="text-[10px] text-slate-400 font-sans">Resultado:</span>
            <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-xs border border-emerald-200">
              {evaluatedDisplay}
            </span>
          </div>
        )}

        {/* Formula Autocomplete Dropdown & Parameter Guide */}
        {isFocused && (
          <FormulaAutocomplete
            input={inputValue}
            onSelectFormula={handleSelectFormula}
          />
        )}
      </div>
    </div>
  );
};


