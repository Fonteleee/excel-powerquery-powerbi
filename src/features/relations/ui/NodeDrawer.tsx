// src/features/relations/ui/NodeDrawer.tsx
// Painel lateral (drawer) do nó selecionado: parâmetros, estatísticas do cruzamento e PREVIEW ao vivo.
// As edições vão direto para o grafo; o preview acompanha porque o grafo é reavaliado (com debounce).

import React, { useMemo, useState } from 'react';
import { ArrowRight, FileOutput, Funnel, Link2, Play, Search, Sigma, Table2, Trash2, TriangleAlert, X } from 'lucide-react';
import { cardinalityNote } from '../analysis/cableStatus';
import { inferTableTypes, TYPE_LABELS } from '../analysis/typeInference';
import { inputsOf } from '../model/dag';
import { FlowGraph, FlowNode, LookupParams, TransformParams } from '../model/graph';
import { FlowTable, NodeResult } from '../runtime/evaluate';
import { flowSheetId } from '../runtime/materialize';
import { AggregateForm } from './drawer/AggregateForm';
import { Field, inputClass, TypeLookup } from './drawer/fields';
import { FilterForm } from './drawer/FilterForm';
import { LookupForm } from './drawer/LookupForm';
import { formatCount, formatPercent } from './format';
import { nodeDisplayName } from './labels';
import { OutputStatus } from './OutputNodeView';
import { PreviewPanel } from './PreviewGrid';
import { CABLES } from './tokens';

interface NodeDrawerProps {
  node: FlowNode;
  graph: FlowGraph;
  results: ReadonlyMap<string, NodeResult>;
  sheetNames: ReadonlyMap<string, string>;
  outputStatus: OutputStatus;
  onClose: () => void;
  onChangeParams: (nodeId: string, params: TransformParams) => void;
  onChangeOp: (nodeId: string, op: TransformParams['op']) => void;
  onRenameOutput: (nodeId: string, sheetName: string) => void;
  onRemove: (nodeId: string) => void;
  onRunFlow: () => void;
  onOpenSheet?: (sheetId: string) => void;
}

const OPS: { op: TransformParams['op']; label: string; icon: React.ReactNode }[] = [
  { op: 'lookup', label: 'Buscar', icon: <Search className="size-4" aria-hidden /> },
  { op: 'aggregate', label: 'Agregar', icon: <Sigma className="size-4" aria-hidden /> },
  { op: 'filter', label: 'Filtrar', icon: <Funnel className="size-4" aria-hidden /> },
];

function typeLookup(table: FlowTable | null | undefined): TypeLookup {
  if (!table) return () => undefined;
  const types = inferTableTypes(table);
  return column => types[column];
}

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  node, graph, results, sheetNames, outputStatus, onClose, onChangeParams, onChangeOp, onRenameOutput, onRemove, onRunFlow, onOpenSheet,
}) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const result = results.get(node.id);
  const inputs = inputsOf(graph, node.id);
  const mainResult = inputs.in ? results.get(inputs.in.from) : undefined;
  const lookupResult = inputs.lookup ? results.get(inputs.lookup.from) : undefined;
  const mainTypes = useMemo(() => typeLookup(mainResult?.table), [mainResult?.table]);
  const lookupTypes = useMemo(() => typeLookup(lookupResult?.table), [lookupResult?.table]);

  const nodeById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
  const inputName = (edgeFrom: string | undefined): string => {
    const source = edgeFrom ? nodeById.get(edgeFrom) : undefined;
    return source ? nodeDisplayName(source, sheetNames) : 'não conectada';
  };

  const title = nodeDisplayName(node, sheetNames);
  const headerIcon =
    node.kind === 'table' ? <Table2 className="size-5 text-cyan-800" aria-hidden /> :
    node.kind === 'output' ? <FileOutput className="size-5 text-emerald-800" aria-hidden /> :
    node.params.op === 'lookup' ? <Search className="size-5" style={{ color: CABLES.lookup.color }} aria-hidden /> :
    node.params.op === 'aggregate' ? <Sigma className="size-5" style={{ color: CABLES.aggregate.color }} aria-hidden /> :
    <Funnel className="size-5" style={{ color: CABLES.raw.color }} aria-hidden />;

  // Colunas que a transformação acrescentou: ficam destacadas no preview.
  const highlight = useMemo(() => {
    if (node.kind !== 'transform' || node.params.op !== 'lookup' || !result?.table || !mainResult?.table) return undefined;
    const before = new Set(mainResult.table.headers);
    return new Set(result.table.headers.filter(h => !before.has(h)));
  }, [node, result?.table, mainResult?.table]);

  const stats = result?.lookup;
  const note = stats ? cardinalityNote(stats) : null;

  return (
    <aside className="rel-drawer" aria-label={`Painel do nó ${title}`}>
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {headerIcon}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[length:var(--rel-text-title)] font-extrabold" title={title}>{title}</h2>
          <p className="text-[length:var(--rel-text-caption)] text-slate-700">
            {node.kind === 'table' ? 'Tabela de origem' : node.kind === 'output' ? 'Saída: nova aba' : 'Transformação'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar painel" title="Fechar (Esc)" className="flex size-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
          <X className="size-5" />
        </button>
      </header>

      <div className="rel-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {node.kind === 'transform' && (
          <>
            <div role="tablist" aria-label="Operação" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {OPS.map(o => (
                <button
                  key={o.op}
                  type="button"
                  role="tab"
                  aria-selected={node.params.op === o.op}
                  onClick={() => onChangeOp(node.id, o.op)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[length:var(--rel-text-body)] font-bold ${
                    node.params.op === o.op ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>

            <dl className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[length:var(--rel-text-caption)]">
              <div className="flex items-center gap-1.5">
                <dt className="font-bold text-slate-700">Entrada:</dt>
                <dd className="truncate text-slate-900">{inputName(inputs.in?.from)}</dd>
              </div>
              {node.params.op === 'lookup' && (
                <div className="flex items-center gap-1.5">
                  <dt className="flex items-center gap-1 font-bold text-slate-700"><Link2 className="size-3" aria-hidden />Busca em:</dt>
                  <dd className="truncate text-slate-900">{inputName(inputs.lookup?.from)}</dd>
                </div>
              )}
            </dl>

            {node.params.op === 'lookup' && (
              <LookupForm
                params={node.params}
                sourceColumns={mainResult?.table?.headers ?? []}
                lookupColumns={lookupResult?.table?.headers ?? []}
                sourceTypes={mainTypes}
                lookupTypes={lookupTypes}
                onChange={(p: LookupParams) => onChangeParams(node.id, p)}
              />
            )}
            {node.params.op === 'aggregate' && (
              <AggregateForm params={node.params} columns={mainResult?.table?.headers ?? []} types={mainTypes} onChange={p => onChangeParams(node.id, p)} />
            )}
            {node.params.op === 'filter' && (
              <FilterForm params={node.params} columns={mainResult?.table?.headers ?? []} types={mainTypes} onChange={p => onChangeParams(node.id, p)} />
            )}
          </>
        )}

        {node.kind === 'output' && (
          <div className="space-y-3">
            <Field label="Nome da aba gerada" hint="A aba é recriada no mesmo lugar a cada execução. Suas planilhas originais nunca são alteradas.">
              {id => (
                <input id={id} type="text" value={node.sheetName} maxLength={64} onChange={e => onRenameOutput(node.id, e.target.value)} className={inputClass} />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onRunFlow} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[length:var(--rel-text-body)] font-bold text-white hover:bg-emerald-800">
                <Play className="size-4" aria-hidden /> Executar fluxo
              </button>
              {onOpenSheet && outputStatus !== 'pending' && (
                <button type="button" onClick={() => onOpenSheet(flowSheetId(node.id))} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[length:var(--rel-text-body)] font-semibold text-slate-800 hover:bg-slate-50">
                  Ver na aba Dados <ArrowRight className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        )}

        {node.kind === 'table' && result?.table && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Campos e tipos inferidos">
            {result.table.headers.map(h => {
              const info = inferTableTypes(result.table!)[h];
              return (
                <li key={h} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[length:var(--rel-text-body)]">
                  <span className="truncate font-semibold">{h}</span>
                  <span className="shrink-0 text-[length:var(--rel-text-caption)] text-slate-700">
                    {info ? `${TYPE_LABELS[info.type]} · ${formatPercent(info.uniqueRatio * 100)} únicos` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {stats && (
          <section aria-label="Qualidade do cruzamento" className="space-y-1.5">
            <h3 className="text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">Qualidade do cruzamento</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="de match" value={formatPercent(stats.matchRate)} bad={stats.matchRate < 100} />
              <Stat label="órfãos" value={formatCount(stats.orphans)} bad={stats.orphans > 0} />
              <Stat label="cardinalidade" value={note?.label ?? '—'} bad={!!note?.warning} />
            </div>
            {note?.warning && (
              <p role="status" className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[length:var(--rel-text-caption)] text-amber-900">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{note.warning}</span>
              </p>
            )}
          </section>
        )}

        <section aria-label="Preview" className="space-y-1.5">
          <h3 className="text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">Preview ao vivo</h3>
          <PreviewPanel result={result} limit={10} highlight={highlight} />
        </section>
      </div>

      {node.kind !== 'table' && (
        <footer className="border-t border-slate-200 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              if (confirmRemove) onRemove(node.id);
              else {
                setConfirmRemove(true);
                setTimeout(() => setConfirmRemove(false), 2500);
              }
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[length:var(--rel-text-body)] font-semibold ${
              confirmRemove ? 'bg-rose-700 text-white' : 'text-rose-800 hover:bg-rose-50'
            }`}
          >
            <Trash2 className="size-4" aria-hidden />
            {confirmRemove ? 'Clique de novo para confirmar' : 'Remover nó'}
          </button>
        </footer>
      )}
    </aside>
  );
};

const Stat: React.FC<{ label: string; value: string; bad: boolean }> = ({ label, value, bad }) => (
  <div className={`rounded-lg border px-2 py-1.5 ${bad ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className={`rel-num text-[length:var(--rel-text-heading)] font-extrabold ${bad ? 'text-rose-800' : 'text-slate-900'}`}>{value}</div>
    <div className="text-[length:var(--rel-text-micro)] font-semibold uppercase text-slate-700">{label}</div>
  </div>
);
