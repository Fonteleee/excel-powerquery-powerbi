// src/features/relations/ui/drawer/fields.tsx
// Campos de formulário reutilizados pelo painel lateral: rótulo, seleção de coluna e seleção múltipla.

import React, { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ColumnTypeInfo, TYPE_LABELS } from '../../analysis/typeInference';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[length:var(--rel-text-body)] text-slate-900 placeholder:text-slate-500 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-200';

export type TypeLookup = (column: string) => ColumnTypeInfo | undefined;

interface FieldProps {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, children }) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[length:var(--rel-text-caption)] text-slate-600">{hint}</p>}
    </div>
  );
};

const optionLabel = (name: string, typeOf?: TypeLookup): string => {
  const type = typeOf?.(name)?.type;
  return type ? `${name} · ${TYPE_LABELS[type]}` : name;
};

interface ColumnSelectProps {
  id?: string;
  value: string;
  columns: readonly string[];
  typeOf?: TypeLookup;
  placeholder?: string;
  disabled?: boolean;
  onChange: (column: string) => void;
}

export const ColumnSelect: React.FC<ColumnSelectProps> = ({ id, value, columns, typeOf, placeholder = 'Escolha uma coluna', disabled, onChange }) => {
  const missing = value !== '' && !columns.includes(value);
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
      aria-invalid={missing || undefined}
    >
      <option value="">{placeholder}</option>
      {missing && <option value={value}>{value} (não existe mais)</option>}
      {columns.map(col => (
        <option key={col} value={col}>
          {optionLabel(col, typeOf)}
        </option>
      ))}
    </select>
  );
};

interface MultiSelectProps {
  columns: readonly string[];
  selected: readonly string[];
  typeOf?: TypeLookup;
  emptyText?: string;
  onChange: (selected: string[]) => void;
}

/** Lista de caixas de seleção com busca, "todas" e "nenhuma". Mantém a ordem original das colunas. */
export const ColumnMultiSelect: React.FC<MultiSelectProps> = ({ columns, selected, typeOf, emptyText = 'Conecte a tabela para ver as colunas', onChange }) => {
  const [term, setTerm] = useState('');
  const chosen = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t === '' ? columns : columns.filter(c => c.toLowerCase().includes(t));
  }, [columns, term]);

  const toggle = (col: string): void => {
    const next = new Set(chosen);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    onChange(columns.filter(c => next.has(c)).concat(selected.filter(s => !columns.includes(s))));
  };

  if (columns.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[length:var(--rel-text-caption)] text-slate-600">{emptyText}</p>;
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-1">
        <Search className="size-3.5 shrink-0 text-slate-500" aria-hidden />
        <input
          type="text"
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Buscar coluna…"
          aria-label="Buscar coluna"
          className="min-w-0 flex-1 bg-transparent text-[length:var(--rel-text-body)] text-slate-900 placeholder:text-slate-500 focus:outline-hidden"
        />
        <button type="button" onClick={() => onChange([...columns])} className="rounded px-1.5 py-0.5 text-[length:var(--rel-text-caption)] font-semibold text-indigo-800 hover:bg-indigo-50">
          Todas
        </button>
        <button type="button" onClick={() => onChange([])} className="rounded px-1.5 py-0.5 text-[length:var(--rel-text-caption)] font-semibold text-slate-700 hover:bg-slate-100">
          Nenhuma
        </button>
      </div>
      <ul className="rel-scroll max-h-40 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
        {shown.map(col => (
          <li key={col}>
            <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[length:var(--rel-text-body)] hover:bg-slate-50">
              <input type="checkbox" checked={chosen.has(col)} onChange={() => toggle(col)} className="size-3.5 accent-indigo-700" />
              <span className="min-w-0 flex-1 truncate">{col}</span>
              <span className="shrink-0 text-[length:var(--rel-text-micro)] font-semibold uppercase text-slate-600">
                {typeOf?.(col) ? TYPE_LABELS[typeOf(col)!.type] : ''}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-[length:var(--rel-text-caption)] text-slate-600">Nenhuma coluna encontrada</li>}
      </ul>
    </div>
  );
};
