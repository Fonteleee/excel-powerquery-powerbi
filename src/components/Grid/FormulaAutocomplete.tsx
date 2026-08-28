import React, { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import { FORMULA_CATALOG } from '../../engine/formulaParser';

export interface FormulaAutocompleteProps {
  input?: string;
  query?: string;
  position?: { top: number; left: number };
  className?: string;
  onSelectFormula: (formulaText: string) => void;
  onClose?: () => void;
}

export const FormulaAutocomplete: React.FC<FormulaAutocompleteProps> = ({
  input,
  query,
  position,
  className,
  onSelectFormula,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const rawQuery = input ?? query ?? '';
  const cleanQuery = rawQuery.toUpperCase().replace(/^=/, '').trim();
  const filteredFormulas = FORMULA_CATALOG.filter(f =>
    f.name.toUpperCase().startsWith(cleanQuery) ||
    f.name.toUpperCase().includes(cleanQuery)
  ).slice(0, 7);

  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  const handleSelect = (formulaName: string) => {
    if (input !== undefined) {
      onSelectFormula(`=${formulaName}(`);
    } else {
      onSelectFormula(formulaName);
    }
    if (onClose) onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredFormulas.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % filteredFormulas.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + filteredFormulas.length) % filteredFormulas.length);
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        const selected = filteredFormulas[selectedIndex];
        if (selected) {
          handleSelect(selected.name);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (onClose) onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredFormulas, selectedIndex, onSelectFormula, onClose, input]);

  if (filteredFormulas.length === 0) return null;

  const activeItem = filteredFormulas[selectedIndex];

  const styleProps: React.CSSProperties = position
    ? { position: 'fixed', top: `${position.top}px`, left: `${position.left}px` }
    : {};

  return (
    <div
      style={styleProps}
      className={`z-50 flex w-80 max-w-md flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md animate-in fade-in duration-100 ${
        className || 'fixed'
      }`}
    >
      <div className="max-h-48 overflow-y-auto p-1 divide-y divide-slate-100">
        {filteredFormulas.map((f, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={f.name}
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => handleSelect(f.name)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                isSelected
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calculator className={`size-3.5 ${isSelected ? 'text-white' : 'text-emerald-600'}`} />
                <span className="font-mono text-[13px]">{f.name}</span>
              </div>
              <span className={`text-[10px] font-medium ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                {f.category}
              </span>
            </div>
          );
        })}
      </div>

      {activeItem && (
        <div className="border-t border-slate-100 bg-slate-50/80 p-2.5 text-[11px] text-slate-600">
          <div className="font-mono font-semibold text-emerald-800 mb-0.5">
            ={activeItem.syntax}
          </div>
          <p className="text-slate-500 leading-tight mb-1">{activeItem.description}</p>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-200/50">
            <span>Exemplo: <code className="font-mono text-slate-600">={activeItem.example}</code></span>
            <span className="rounded bg-slate-200/80 px-1 py-0.5 font-mono text-[9px] text-slate-700">
              Tab ⇥
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
