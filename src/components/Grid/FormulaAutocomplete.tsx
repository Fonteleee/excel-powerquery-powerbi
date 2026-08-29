import React, { useEffect, useState, useMemo } from 'react';
import { Calculator, HelpCircle, MousePointerClick } from 'lucide-react';
import { FORMULA_CATALOG } from '../../engine/formulaParser';
import { parseActiveFunctionAndParam } from '../../engine/formulaPointHelper';

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
  const isFormula = rawQuery.startsWith('=');

  // Check if we are inside function arguments (e.g. =PROCX( or =SOMA(A1; )
  const activeFunctionInfo = useMemo(() => {
    return isFormula ? parseActiveFunctionAndParam(rawQuery) : null;
  }, [rawQuery, isFormula]);

  // If typing function name (before opening paren)
  const cleanQuery = useMemo(() => {
    if (activeFunctionInfo) return '';
    const withoutEqual = rawQuery.replace(/^=/, '').trim();
    // Only match alphabetic function prefix
    const match = withoutEqual.match(/^[A-ZÀ-Úa-z0-9._]*/);
    return match ? match[0].toUpperCase() : '';
  }, [rawQuery, activeFunctionInfo]);

  const filteredFormulas = useMemo(() => {
    if (activeFunctionInfo || !cleanQuery) return [];
    return FORMULA_CATALOG.filter(
      f =>
        f.name.toUpperCase().startsWith(cleanQuery) ||
        f.name.toUpperCase().includes(cleanQuery)
    ).slice(0, 7);
  }, [cleanQuery, activeFunctionInfo]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  const handleSelect = (formulaName: string) => {
    onSelectFormula(`=${formulaName}(`);
    if (onClose) onClose();
  };

  useEffect(() => {
    if (filteredFormulas.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [filteredFormulas, selectedIndex, onSelectFormula, onClose]);

  const styleProps: React.CSSProperties = position
    ? { position: 'fixed', top: `${position.top}px`, left: `${position.left}px` }
    : {};

  // =========================================================================
  // VIEW 1: ACTIVE PARAMETER SYNTAX TOOLTIP GUIDE (When inside function args)
  // =========================================================================
  if (activeFunctionInfo && activeFunctionInfo.guide) {
    const { guide, activeParamIndex } = activeFunctionInfo;
    const activeParam = guide.params[activeParamIndex] || guide.params[guide.params.length - 1];

    return (
      <div
        style={styleProps}
        className={`z-50 flex w-96 max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md animate-in fade-in duration-100 font-sans ${
          className || 'fixed'
        }`}
      >
        {/* Header with function name and parameter track */}
        <div className="bg-slate-900 px-3 py-2 text-white">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
              <Calculator className="size-3.5" />
              <span>{guide.name}</span>
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {guide.category}
            </span>
          </div>

          {/* Syntax Parameter Track */}
          <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] leading-relaxed">
            <span className="text-slate-400">{guide.name}(</span>
            {guide.params.map((p, idx) => {
              const isActive = idx === activeParamIndex;
              return (
                <React.Fragment key={p.name}>
                  {idx > 0 && <span className="text-slate-500">; </span>}
                  <span
                    className={`rounded px-1.5 py-0.5 transition-all ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs scale-105 ring-1 ring-emerald-300'
                        : p.optional
                        ? 'text-slate-400 italic'
                        : 'text-slate-300'
                    }`}
                  >
                    {p.optional ? `[${p.name}]` : p.name}
                  </span>
                </React.Fragment>
              );
            })}
            <span className="text-slate-400">)</span>
          </div>
        </div>

        {/* Active parameter description card */}
        {activeParam && (
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs">
            <div className="flex items-start gap-2">
              <HelpCircle className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 mb-0.5">
                  {activeParam.name} {activeParam.optional && <span className="text-[10px] font-normal text-slate-500">(opcional)</span>}
                </div>
                <p className="text-slate-600 text-[11px] leading-snug">
                  {activeParam.description}
                </p>
              </div>
            </div>

            {/* Mouse Selection Hint */}
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
              <div className="flex items-center gap-1 text-emerald-700 font-medium">
                <MousePointerClick className="size-3" />
                <span>Clique e arraste nas células para selecionar</span>
              </div>
              <span className="font-mono text-[9px] text-slate-400 bg-slate-200/80 px-1 py-0.5 rounded">
                Ponto de Referência
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FUNCTION AUTOCOMPLETE DROPDOWN (When typing function name)
  // =========================================================================
  if (filteredFormulas.length === 0) return null;

  const activeItem = filteredFormulas[selectedIndex];

  return (
    <div
      style={styleProps}
      className={`z-50 flex w-80 max-w-md flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md animate-in fade-in duration-100 font-sans ${
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
              Tab ⇥ ou Enter
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
