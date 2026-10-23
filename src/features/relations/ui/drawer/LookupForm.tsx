// src/features/relations/ui/drawer/LookupForm.tsx
// Parâmetros da busca (PROCX): chave de origem, coluna de busca, colunas de retorno, valor padrão e prefixo.

import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { TYPE_LABELS } from '../../analysis/typeInference';
import { LookupParams } from '../../model/graph';
import { ColumnMultiSelect, ColumnSelect, Field, inputClass, TypeLookup } from './fields';

interface LookupFormProps {
  params: LookupParams;
  sourceColumns: readonly string[];
  lookupColumns: readonly string[];
  sourceTypes: TypeLookup;
  lookupTypes: TypeLookup;
  onChange: (params: LookupParams) => void;
}

/** Avisa quando os dois lados da chave têm tipos que dificilmente se casam. */
export function keyTypeWarning(params: LookupParams, sourceTypes: TypeLookup, lookupTypes: TypeLookup): string | null {
  if (!params.sourceKey || !params.lookupKey) return null;
  const a = sourceTypes(params.sourceKey)?.type;
  const b = lookupTypes(params.lookupKey)?.type;
  if (!a || !b || a === 'empty' || b === 'empty') return null;
  const keyLike = (t: string): boolean => t === 'id' || t === 'text';
  if (a === b || (keyLike(a) && keyLike(b))) return null;
  return `Tipos diferentes nas chaves: ${TYPE_LABELS[a]} e ${TYPE_LABELS[b]}. A busca pode não encontrar correspondências.`;
}

export const LookupForm: React.FC<LookupFormProps> = ({ params, sourceColumns, lookupColumns, sourceTypes, lookupTypes, onChange }) => {
  const warning = keyTypeWarning(params, sourceTypes, lookupTypes);
  return (
    <div className="space-y-3">
      <Field label="Chave na tabela de origem" hint="Valor que será procurado, linha a linha.">
        {id => (
          <ColumnSelect id={id} value={params.sourceKey} columns={sourceColumns} typeOf={sourceTypes} onChange={sourceKey => onChange({ ...params, sourceKey })} />
        )}
      </Field>
      <Field label="Coluna de busca na outra tabela" hint="Onde o valor será procurado (primeira ocorrência vence).">
        {id => (
          <ColumnSelect id={id} value={params.lookupKey} columns={lookupColumns} typeOf={lookupTypes} onChange={lookupKey => onChange({ ...params, lookupKey })} />
        )}
      </Field>
      {warning && (
        <p role="status" className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[length:var(--rel-text-caption)] text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      )}
      <Field label={`Colunas a trazer (${params.returns.length})`}>
        {() => (
          <ColumnMultiSelect
            columns={lookupColumns}
            selected={params.returns}
            typeOf={lookupTypes}
            onChange={returns => onChange({ ...params, returns })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Se não encontrar">
          {id => (
            <input id={id} type="text" value={params.ifNotFound} maxLength={256} placeholder="(vazio)" onChange={e => onChange({ ...params, ifNotFound: e.target.value })} className={inputClass} />
          )}
        </Field>
        <Field label="Prefixo das colunas">
          {id => (
            <input id={id} type="text" value={params.prefix ?? ''} maxLength={64} placeholder="opcional" onChange={e => onChange({ ...params, prefix: e.target.value || undefined })} className={inputClass} />
          )}
        </Field>
      </div>
    </div>
  );
};
