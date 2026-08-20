import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FORMULA_CATALOG, FormulaParamGuide } from '../../engine/formulaParser';

interface FormulaAutocompleteProps {
  input: string;
  onSelectFormula: (completedText: string) => void;
  className?: string;
  maxSuggestions?: number;
}

export const FormulaAutocomplete: React.FC<FormulaAutocompleteProps> = ({
  input,
  onSelectFormula,
  className = '',
  maxSuggestions = 6,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse state: Are we typing a function name or filling parameters?
  const parsedState = useMemo(() => {
    if (!input || !input.startsWith('=')) return null;

    const text = input.substring(1); // remove leading '='
    if (!text.trim()) {
      // Just '=', suggest top popular formulas
      return {
        mode: 'suggest_function' as const,
        prefix: '',
        suggestions: FORMULA_CATALOG.slice(0, maxSuggestions),
        replaceStart: 1,
      };
    }

    // Check if inside parentheses (Parameter Guide Mode)
    // Example: "PROCX(A2, B2:B10" or "SOMA(A1:"
    const lastOpenParenIndex = input.lastIndexOf('(');
    const lastCloseParenIndex = input.lastIndexOf(')');

    if (lastOpenParenIndex > 0 && (lastCloseParenIndex === -1 || lastCloseParenIndex < lastOpenParenIndex)) {
      // Inside function arguments!
      // Extract function name before '('
      const beforeParen = input.substring(0, lastOpenParenIndex);
      const funcNameMatch = beforeParen.match(/([A-Za-zÀ-ÖØ-öø-ÿ_.]+)\s*$/);
      if (funcNameMatch) {
        const funcName = funcNameMatch[1].toUpperCase();
        const guide = FORMULA_CATALOG.find(
          f => f.name.toUpperCase() === funcName || f.name.replace(/\./g, '').toUpperCase() === funcName.replace(/\./g, '')
        );

        if (guide) {
          // Count active parameter by counting unnested commas/semicolons
          const argsText = input.substring(lastOpenParenIndex + 1);
          let commaCount = 0;
          let inQuotes = false;
          for (let i = 0; i < argsText.length; i++) {
            if (argsText[i] === '"') inQuotes = !inQuotes;
            if (!inQuotes && (argsText[i] === ',' || argsText[i] === ';')) {
              commaCount++;
            }
          }

          return {
            mode: 'parameter_guide' as const,
            guide,
            activeParamIndex: commaCount,
          };
        }
      }
    }

    // Typing a formula name (e.g. "=P", "=PROC", "=SOM", "=SE")
    const match = text.match(/([A-Za-zÀ-ÖØ-öø-ÿ_.]+)$/);
    if (match) {
      const prefix = match[1].toUpperCase();
      const replaceStart = input.length - match[1].length;

      const filtered = FORMULA_CATALOG.filter(item => {
        const name = item.name.toUpperCase();
        return name.startsWith(prefix) || name.includes(prefix);
      }).slice(0, maxSuggestions);

      if (filtered.length > 0) {
        return {
          mode: 'suggest_function' as const,
          prefix,
          suggestions: filtered,
          replaceStart,
        };
      }
    }

    return null;
  }, [input, maxSuggestions]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [parsedState?.mode, (parsedState as any)?.prefix]);

  // Handle keyboard navigation for suggestions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!parsedState || parsedState.mode !== 'suggest_function') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % parsedState.suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + parsedState.suggestions.length) % parsedState.suggestions.length);
      } else if (e.key === 'Tab' || (e.key === 'Enter' && parsedState.suggestions.length > 0)) {
        e.preventDefault();
        e.stopPropagation();
        const selected = parsedState.suggestions[selectedIndex];
        if (selected) {
          applySuggestion(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [parsedState, selectedIndex]);

  const applySuggestion = (guide: FormulaParamGuide) => {
    if (!parsedState || parsedState.mode !== 'suggest_function') return;
    const before = input.substring(0, parsedState.replaceStart);
    const completed = `${before}${guide.name}(`;
    onSelectFormula(completed);
  };

  if (!parsedState) return null;

  // 1. PARAMETER GUIDE TOOLTIP MODE
  if (parsedState.mode === 'parameter_guide') {
    const { guide, activeParamIndex } = parsedState;
    const currentParam = guide.params[activeParamIndex] || guide.params[guide.params.length - 1];

    return (
      <div
        ref={containerRef}
        className={`absolute left-0 top-full mt-1.5 z-50 w-auto min-w-[340px] max-w-lg bg-slate-900 text-white rounded-lg shadow-2xl border border-slate-700 p-2.5 text-xs font-sans animate-in fade-in slide-in-from-top-1 duration-150 ${className}`}
      >
        <div className="flex items-center gap-1.5 font-mono text-[11px] pb-1.5 border-b border-slate-800 text-slate-300 flex-wrap">
          <span className="font-bold text-emerald-400">{guide.name}(</span>
          {guide.params.map((param, idx) => {
            const isActive = idx === activeParamIndex;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-500">; </span>}
                <span
                  className={`px-1 py-0.5 rounded-xs transition-colors ${
                    isActive
                      ? 'bg-emerald-500/30 text-emerald-300 font-bold underline'
                      : param.optional
                      ? 'text-slate-400 italic'
                      : 'text-slate-200'
                  }`}
                >
                  {param.optional ? `[${param.name}]` : param.name}
                </span>
              </React.Fragment>
            );
          })}
          <span className="font-bold text-emerald-400">)</span>
        </div>

        {currentParam && (
          <div className="pt-1.5 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-400">{currentParam.name}:</span>
              <span className="text-slate-300 text-[11px]">{currentParam.description}</span>
            </div>
            {guide.example && (
              <div className="text-[10px] text-slate-400 font-mono pt-0.5">
                Ex: <span className="text-amber-300">{guide.example}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 2. INTELLISENSE FUNCTION AUTOCOMPLETE DROPDOWN MODE
  const { suggestions, prefix } = parsedState;
  const activeGuide = suggestions[selectedIndex] || suggestions[0];

  return (
    <div
      ref={containerRef}
      className={`absolute left-0 top-full mt-1.5 z-50 w-[420px] bg-[#0f172a]/95 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden flex flex-col text-xs font-sans animate-in fade-in duration-100 ${className}`}
    >
      {/* Suggestions List */}
      <div className="max-h-52 overflow-y-auto divide-y divide-white/5 scrollbar-thin">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const matchPos = item.name.toUpperCase().indexOf(prefix);

          return (
            <div
              key={item.name}
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => applySuggestion(item)}
              className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                isSelected ? 'bg-emerald-500/20 text-white' : 'hover:bg-white/5 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`size-5 rounded flex items-center justify-center font-serif italic font-bold text-[11px] ${
                  isSelected ? 'bg-emerald-500 text-white shadow-xs' : 'bg-white/10 text-slate-400'
                }`}>
                  fx
                </div>
                <div>
                  <span className="font-mono font-bold text-xs text-white">
                    {matchPos >= 0 ? (
                      <>
                        {item.name.substring(0, matchPos)}
                        <span className="text-emerald-400 underline">{item.name.substring(matchPos, matchPos + prefix.length)}</span>
                        {item.name.substring(matchPos + prefix.length)}
                      </>
                    ) : (
                      item.name
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-2 font-mono">({item.category})</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Tab ⇥</span>
            </div>
          );
        })}
      </div>

      {/* Guide Preview Card */}
      {activeGuide && (
        <div className="p-3 bg-[#090d16] border-t border-white/10 text-slate-300 text-[11px] space-y-1">
          <div className="font-mono font-bold text-emerald-400 text-xs">{activeGuide.syntax}</div>
          <div className="text-slate-300 leading-relaxed">{activeGuide.description}</div>
          {activeGuide.example && (
            <div className="text-[10px] text-slate-400 font-mono pt-1">
              Exemplo: <span className="text-amber-300">{activeGuide.example}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
