// src/features/relations/ui/ConnectionPopover.tsx
// Aparece ao soltar um campo sobre outro: lista as operações ORDENADAS pelo tipo inferido dos dois campos.
// Nenhuma operação é escondida; a primeira vem marcada como recomendada. Navegação por teclado (setas, Enter, Esc).

import React, { useEffect, useRef, useState } from 'react';
import { Funnel, Hash, Link2, Search, Sigma, Sparkles } from 'lucide-react';
import { ConnectOperation, OperationSuggestion } from '../analysis/suggestions';
import { ColumnTypeInfo, TYPE_LABELS } from '../analysis/typeInference';

export interface PopoverTarget {
  /** Posição dentro do contêiner do canvas, em px. */
  x: number;
  y: number;
  fromLabel: string;
  toLabel: string;
  fromType: ColumnTypeInfo | undefined;
  toType: ColumnTypeInfo | undefined;
  suggestions: OperationSuggestion[];
}

interface ConnectionPopoverProps {
  target: PopoverTarget;
  bounds: { width: number; height: number };
  onPick: (op: ConnectOperation) => void;
  onClose: () => void;
}

const ICONS: Record<ConnectOperation, React.ReactNode> = {
  lookup: <Search className="size-4" aria-hidden />,
  sum: <Sigma className="size-4" aria-hidden />,
  avg: <Sigma className="size-4" aria-hidden />,
  count: <Hash className="size-4" aria-hidden />,
  min: <Sigma className="size-4" aria-hidden />,
  max: <Sigma className="size-4" aria-hidden />,
  filter: <Funnel className="size-4" aria-hidden />,
};

const WIDTH = 300;
const MAX_HEIGHT = 380;

export const ConnectionPopover: React.FC<ConnectionPopoverProps> = ({ target, bounds, onPick, onClose }) => {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { suggestions } = target;

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const left = Math.max(8, Math.min(target.x, bounds.width - WIDTH - 8));
  const top = Math.max(8, Math.min(target.y, bounds.height - MAX_HEIGHT - 8));
  const typeText = (t: ColumnTypeInfo | undefined): string => (t ? TYPE_LABELS[t.type] : 'sem dados');

  return (
    <>
      <div className="absolute inset-0 z-40" onPointerDown={onClose} aria-hidden />
      <div className="rel-popover absolute z-50 p-1.5" style={{ left, top, width: WIDTH, maxHeight: MAX_HEIGHT }} role="dialog" aria-label="Escolher operação para os campos ligados">
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[length:var(--rel-text-body)] font-bold">
            <Link2 className="size-4 text-violet-700" aria-hidden />
            <span className="truncate" title={target.fromLabel}>{target.fromLabel}</span>
            <span aria-hidden>→</span>
            <span className="truncate" title={target.toLabel}>{target.toLabel}</span>
          </div>
          <div className="mt-0.5 text-[length:var(--rel-text-caption)] text-slate-700">
            {typeText(target.fromType)} → {typeText(target.toType)}. Escolha o que fazer:
          </div>
        </div>
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-activedescendant={`rel-op-${suggestions[active]?.op}`}
          className="rel-scroll max-h-72 overflow-y-auto focus:outline-hidden"
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(i => (i + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(i => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              onPick(suggestions[active].op);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        >
          {suggestions.map((s, index) => (
            <li
              key={s.op}
              id={`rel-op-${s.op}`}
              role="option"
              aria-selected={index === active}
              onPointerEnter={() => setActive(index)}
              onClick={() => onPick(s.op)}
              className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 ${index === active ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''}`}
            >
              <span className="mt-0.5 text-violet-800">{ICONS[s.op]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[length:var(--rel-text-body)] font-bold">
                  {s.label}
                  <span className="rel-num text-[length:var(--rel-text-micro)] font-semibold text-slate-600">{s.excelName}</span>
                  {s.recommended && (
                    <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[length:var(--rel-text-micro)] font-bold text-emerald-900">
                      <Sparkles className="size-3" aria-hidden /> Recomendado
                    </span>
                  )}
                </span>
                {s.reason && <span className="block text-[length:var(--rel-text-caption)] text-slate-700">{s.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};
