// src/features/relations/ui/drawer/FilterForm.tsx
// Parâmetros do filtro (FILTRO): lista de condições, todas precisam ser verdadeiras (E).

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FilterOperator, FilterParams } from '../../model/graph';
import { ColumnSelect, inputClass, TypeLookup } from './fields';

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: '=', label: 'é igual a' },
  { value: '<>', label: 'é diferente de' },
  { value: '>', label: 'maior que' },
  { value: '>=', label: 'maior ou igual a' },
  { value: '<', label: 'menor que' },
  { value: '<=', label: 'menor ou igual a' },
  { value: 'contains', label: 'contém' },
];

interface FilterFormProps {
  params: FilterParams;
  columns: readonly string[];
  types: TypeLookup;
  onChange: (params: FilterParams) => void;
}

export const FilterForm: React.FC<FilterFormProps> = ({ params, columns, types, onChange }) => {
  const update = (index: number, patch: Partial<FilterParams['conditions'][number]>): void =>
    onChange({ ...params, conditions: params.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-2">
      <div className="text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">
        Condições (todas precisam ser verdadeiras)
      </div>
      {params.conditions.map((cond, index) => (
        <div key={index} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="grid grid-cols-[1fr_auto] items-center gap-1.5">
            <ColumnSelect value={cond.column} columns={columns} typeOf={types} onChange={column => update(index, { column })} />
            <button
              type="button"
              aria-label="Remover condição"
              title="Remover condição"
              onClick={() => onChange({ ...params, conditions: params.conditions.filter((_, i) => i !== index) })}
              className="flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={cond.operator}
              aria-label="Operador"
              onChange={e => update(index, { operator: e.target.value as FilterOperator })}
              className={inputClass}
            >
              {OPERATORS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={cond.value}
              maxLength={256}
              placeholder="valor"
              aria-label="Valor da condição"
              onChange={e => update(index, { value: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={columns.length === 0}
        onClick={() => onChange({ ...params, conditions: [...params.conditions, { column: columns[0] ?? '', operator: types(columns[0] ?? '')?.type === 'number' ? '>=' : '=', value: '' }] })}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-[length:var(--rel-text-body)] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden /> Adicionar condição
      </button>
    </div>
  );
};
