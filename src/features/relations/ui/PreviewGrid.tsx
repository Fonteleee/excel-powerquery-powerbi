// src/features/relations/ui/PreviewGrid.tsx
// Grade leve SOMENTE LEITURA para o preview do nó (drawer e dica ao passar o mouse).
// Virtualizada com @tanstack/react-virtual: renderiza só as linhas visíveis, então cabe amostras maiores sem custo.

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TriangleAlert } from 'lucide-react';
import type { FlowTable, NodeResult } from '../runtime/evaluate';
import { cellText, formatCount } from './format';

const ROW_HEIGHT = 26;
const MIN_COL_WIDTH = 104;

interface PreviewGridProps {
  table: FlowTable;
  /** Quantas linhas da amostra mostrar (padrão 8). */
  limit?: number;
  /** Altura máxima da área de linhas, em px. */
  maxHeight?: number;
  /** Colunas a destacar (por exemplo as que o nó acrescentou). */
  highlight?: ReadonlySet<string>;
}

export const PreviewGrid: React.FC<PreviewGridProps> = ({ table, limit = 8, maxHeight = 232, highlight }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.rows.slice(0, Math.max(1, limit));
  const columns = table.headers;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });
  const template = `repeat(${Math.max(1, columns.length)}, minmax(${MIN_COL_WIDTH}px, 1fr))`;
  const minWidth = Math.max(1, columns.length) * MIN_COL_WIDTH;
  const height = Math.min(maxHeight, rows.length * ROW_HEIGHT);

  if (columns.length === 0) {
    return <div className="px-3 py-4 text-center text-[length:var(--rel-text-caption)] text-slate-600">Sem colunas para mostrar</div>;
  }

  return (
    <div className="rel-scroll overflow-x-auto rounded-lg border border-slate-200 bg-white" role="table" aria-label="Amostra do resultado" aria-rowcount={rows.length + 1}>
      <div style={{ minWidth }}>
        <div
          role="row"
          className="grid border-b border-slate-200 bg-slate-100"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map(col => (
            <div
              key={col}
              role="columnheader"
              title={col}
              className={`truncate px-2 py-1.5 text-[length:var(--rel-text-caption)] font-bold ${
                highlight?.has(col) ? 'bg-violet-100 text-violet-900' : 'text-slate-800'
              }`}
            >
              {col}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="px-3 py-4 text-center text-[length:var(--rel-text-caption)] text-slate-600">Nenhuma linha neste resultado</div>
        ) : (
          <div ref={parentRef} className="rel-scroll overflow-y-auto" style={{ height }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(item => {
                const row = rows[item.index];
                return (
                  <div
                    key={item.key}
                    role="row"
                    className={`grid items-center border-b border-slate-100 ${item.index % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: item.size,
                      transform: `translateY(${item.start}px)`,
                      gridTemplateColumns: template,
                    }}
                  >
                    {columns.map(col => (
                      <div
                        key={col}
                        role="cell"
                        className={`rel-preview-cell rel-num truncate px-2 text-[length:var(--rel-text-caption)] text-slate-900 ${
                          highlight?.has(col) ? 'bg-violet-50 font-semibold' : ''
                        }`}
                        title={cellText(row[col])}
                      >
                        {cellText(row[col])}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface PreviewPanelProps {
  result: NodeResult | undefined;
  limit?: number;
  highlight?: ReadonlySet<string>;
  maxHeight?: number;
}

/** Preview com tratamento de erro (mostra a causa original) e total de linhas. */
export const PreviewPanel: React.FC<PreviewPanelProps> = ({ result, limit, highlight, maxHeight }) => {
  if (!result) return <div className="py-6 text-center text-[length:var(--rel-text-body)] text-slate-600">Calculando…</div>;
  if (result.error || !result.table) {
    return (
      <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-[length:var(--rel-text-body)] text-rose-900">
        <div className="mb-1 flex items-center gap-1.5 font-bold">
          <TriangleAlert className="size-4" aria-hidden />
          <span>{result.error ?? 'Sem resultado'}</span>
        </div>
        {result.rootCause && result.rootCause !== result.error && (
          <div className="text-[length:var(--rel-text-caption)]">
            <span className="font-semibold">Causa original:</span> {result.rootCause}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <PreviewGrid table={result.table} limit={limit} highlight={highlight} maxHeight={maxHeight} />
      <div className="rel-num text-[length:var(--rel-text-caption)] text-slate-700">
        Mostrando {Math.min(limit ?? 8, result.table.rows.length)} de {formatCount(result.table.rows.length)} linhas ·{' '}
        {result.table.headers.length} colunas
      </div>
    </div>
  );
};
