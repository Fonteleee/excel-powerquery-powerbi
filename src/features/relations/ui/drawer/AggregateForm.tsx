// src/features/relations/ui/drawer/AggregateForm.tsx
// Parâmetros da agregação (SOMASE/MÉDIASE/CONT.SE): colunas de agrupamento e métricas.

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AggregateParams, AggType } from '../../model/graph';
import { ColumnMultiSelect, ColumnSelect, Field, inputClass, TypeLookup } from './fields';

const AGG_OPTIONS: { value: AggType; label: string }[] = [
  { value: 'SUM', label: 'Soma' },
  { value: 'AVG', label: 'Média' },
  { value: 'COUNT', label: 'Contagem' },
  { value: 'MIN', label: 'Mínimo' },
  { value: 'MAX', label: 'Máximo' },
];

interface AggregateFormProps {
  params: AggregateParams;
  columns: readonly string[];
  types: TypeLookup;
  onChange: (params: AggregateParams) => void;
}

/** Métrica padrão para uma coluna nova: soma para números, contagem para o resto. */
export function defaultAggregation(columns: readonly string[], types: TypeLookup): AggregateParams['aggregations'][number] {
  const numeric = columns.find(c => types(c)?.type === 'number');
  if (numeric) return { column: numeric, agg: 'SUM', outputName: `SUM_${numeric}` };
  const first = columns[0] ?? '';
  return { column: first, agg: 'COUNT', outputName: first ? `COUNT_${first}` : undefined };
}

export const AggregateForm: React.FC<AggregateFormProps> = ({ params, columns, types, onChange }) => {
  const update = (index: number, patch: Partial<AggregateParams['aggregations'][number]>): void =>
    onChange({
      ...params,
      aggregations: params.aggregations.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    });

  return (
    <div className="space-y-3">
      <Field label={`Agrupar por (${params.groupBy.length})`} hint="Sem seleção, calcula o total geral.">
        {() => (
          <ColumnMultiSelect columns={columns} selected={params.groupBy} typeOf={types} onChange={groupBy => onChange({ ...params, groupBy })} />
        )}
      </Field>

      <div className="space-y-2">
        <div className="text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">Métricas</div>
        {params.aggregations.map((agg, index) => (
          <div key={index} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5">
              <ColumnSelect
                value={agg.column}
                columns={columns}
                typeOf={types}
                onChange={column => update(index, { column, outputName: `${agg.agg}_${column}` })}
              />
              <select
                value={agg.agg}
                aria-label="Tipo de métrica"
                onChange={e => update(index, { agg: e.target.value as AggType, outputName: `${e.target.value}_${agg.column}` })}
                className={`${inputClass} w-auto`}
              >
                {AGG_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Remover métrica"
                title="Remover métrica"
                onClick={() => onChange({ ...params, aggregations: params.aggregations.filter((_, i) => i !== index) })}
                className="flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <input
              type="text"
              value={agg.outputName ?? ''}
              maxLength={128}
              placeholder="Nome da coluna de saída"
              aria-label="Nome da coluna de saída"
              onChange={e => update(index, { outputName: e.target.value || undefined })}
              className={inputClass}
            />
          </div>
        ))}
        <button
          type="button"
          disabled={columns.length === 0}
          onClick={() => onChange({ ...params, aggregations: [...params.aggregations, defaultAggregation(columns, types)] })}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-[length:var(--rel-text-body)] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden /> Adicionar métrica
        </button>
      </div>
    </div>
  );
};
