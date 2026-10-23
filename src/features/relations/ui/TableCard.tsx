// src/features/relations/ui/TableCard.tsx
// Cartão de tabela do canvas. Três níveis de detalhe (LOD): macro (nome), médio (campos e tipos) e micro (amostra de valores).
// Os pinos são medidos no DOM; este componente só os declara com `data-pin`.

import React, { memo, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, Table2, TriangleAlert, X } from 'lucide-react';
import { ColumnTypeInfo, TYPE_LABELS } from '../analysis/typeInference';
import { DetailLevel } from './geometry';
import { formatCount } from './format';
import { Pin } from './Pin';
import { ReportAnchors, usePinMeasure } from './usePinMeasure';
import { TypeIcon } from './TypeIcon';
import { LAYOUT } from './tokens';

export interface CardColumn {
  name: string;
  info: ColumnTypeInfo | undefined;
  /** Primeiros valores preenchidos (nível micro). */
  samples: string[];
}

interface TableCardProps {
  nodeId: string;
  x: number;
  y: number;
  sheetName: string;
  rowCount: number | null;
  error: string | null;
  columns: CardColumn[];
  collapsed: boolean;
  showKeysOnly: boolean;
  lod: DetailLevel;
  zoom: number;
  selected: boolean;
  /** Há uma ligação sendo arrastada (destaca os pinos de entrada). */
  connecting: boolean;
  /** Campos usados por alguma ligação do fluxo. */
  linkedColumns: ReadonlySet<string>;
  /** Pino de saída que está sendo arrastado a partir deste cartão, se houver. */
  activePin: string | null;
  report: ReportAnchors;
  onToggleCollapse: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
}

const SHORT_TYPE: Record<string, string> = {
  id: 'ID',
  number: 'nº',
  date: 'data',
  boolean: 's/n',
  text: 'texto',
  empty: '—',
};

function TableCardImpl(props: TableCardProps): React.ReactElement {
  const {
    nodeId, x, y, sheetName, rowCount, error, columns, collapsed, showKeysOnly, lod, zoom,
    selected, connecting, linkedColumns, activePin, report, onToggleCollapse, onRemove,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return columns.filter(col => {
      if (showKeysOnly && col.info?.type !== 'id' && !linkedColumns.has(col.name)) return false;
      return term === '' || col.name.toLowerCase().includes(term);
    });
  }, [columns, filter, showKeysOnly, linkedColumns]);

  const showList = !collapsed && lod !== 'macro';
  const signature = `${collapsed}|${lod}|${showKeysOnly}|${filter}|${visible.map(c => c.name).join('\u0001')}`;
  usePinMeasure(rootRef, nodeId, zoom, report, signature);

  return (
    <div
      ref={rootRef}
      data-node-id={nodeId}
      className="rel-card absolute left-0 top-0 select-none"
      data-selected={selected ? 'true' : undefined}
      data-error={error ? 'true' : undefined}
      style={{ width: LAYOUT.cardWidth, transform: `translate3d(${x}px, ${y}px, 0)` }}
      aria-label={`Tabela ${sheetName}`}
    >
      <div
        data-drag-handle
        className="relative flex cursor-grab items-center gap-2 rounded-t-[13px] border-b border-slate-200 bg-[var(--rel-card-header)] px-3 py-2 active:cursor-grabbing"
        style={{ borderRadius: showList ? '13px 13px 0 0' : 13 }}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 text-cyan-800">
          <Table2 className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--rel-text-label)] font-bold" title={sheetName}>
          {sheetName}
        </span>
        {error && (
          <span title={error} className="text-[var(--rel-danger)]" role="img" aria-label={`Erro: ${error}`}>
            <TriangleAlert className="size-3.5" aria-hidden />
          </span>
        )}
        {rowCount !== null && (
          <span className="rel-num rounded-full bg-slate-200 px-2 py-0.5 text-[length:var(--rel-text-caption)] font-semibold text-slate-700">
            {formatCount(rowCount)} linhas
          </span>
        )}
        <button
          type="button"
          data-no-drag
          onClick={() => onToggleCollapse(nodeId)}
          aria-label={collapsed ? 'Expandir campos' : 'Recolher campos'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expandir campos' : 'Recolher campos'}
          className="flex size-6 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200"
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        <button
          type="button"
          data-no-drag
          onClick={() => {
            if (confirmRemove) onRemove(nodeId);
            else {
              setConfirmRemove(true);
              setTimeout(() => setConfirmRemove(false), 2500);
            }
          }}
          aria-label={confirmRemove ? 'Confirmar remoção do fluxo' : 'Remover do fluxo'}
          title={confirmRemove ? 'Clique de novo para remover (a planilha continua existindo)' : 'Remover do fluxo (a planilha continua existindo)'}
          className={`flex size-6 items-center justify-center rounded-md ${
            confirmRemove ? 'bg-rose-600 text-white' : 'text-slate-500 hover:bg-slate-200 hover:text-rose-700'
          }`}
        >
          <X className="size-4" />
        </button>
        <Pin pinKey="out:*" side="right" title="Arraste para ligar a tabela inteira a uma transformação" tone="raw" active={activePin === 'out:*'} />
      </div>

      {showList && columns.length > 6 && (
        <div data-no-drag className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-3 py-1">
          <Search className="size-3 shrink-0 text-slate-500" aria-hidden />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar campos…"
            aria-label={`Filtrar campos de ${sheetName}`}
            className="w-full bg-transparent text-[length:var(--rel-text-caption)] text-slate-800 placeholder:text-slate-500 focus:outline-hidden"
          />
        </div>
      )}

      {showList && (
        <div
          data-scroll
          data-clip
          tabIndex={0}
          role="list"
          aria-label={`Campos de ${sheetName}`}
          className="rel-scroll overflow-y-auto overscroll-contain"
          // Estende a área rolável 16px para os lados: os pinos ficam na borda do cartão sem serem cortados.
          style={{ maxHeight: LAYOUT.listMaxHeight, margin: '0 -16px', padding: '4px 16px', scrollbarWidth: 'none' }}
        >
          {visible.length === 0 && (
            <div className="px-3 py-2 text-[length:var(--rel-text-caption)] text-slate-600">
              {columns.length === 0 ? 'Planilha sem campos' : 'Nenhum campo corresponde ao filtro'}
            </div>
          )}
          {visible.map(col => {
            const pinOut = `out:${col.name}`;
            const type = col.info?.type;
            return (
              <div
                key={col.name}
                role="listitem"
                className="rel-field"
                data-linked={linkedColumns.has(col.name) ? 'true' : undefined}
                title={`${col.name} — ${type ? TYPE_LABELS[type] : 'sem dados'}`}
              >
                <Pin pinKey={`in:${col.name}`} side="left" title={`Soltar aqui para ligar a ${col.name}`} accepts={connecting} />
                <TypeIcon type={type} />
                <span className={`truncate ${type === 'id' ? 'font-bold' : 'font-semibold'}`}>{col.name}</span>
                {lod === 'micro' && col.samples.length > 0 && (
                  <span className="rel-num min-w-0 flex-1 truncate text-[length:var(--rel-text-micro)] text-slate-600">
                    {col.samples.join(' · ')}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[length:var(--rel-text-micro)] font-semibold uppercase tracking-wide text-slate-600">
                  {type ? SHORT_TYPE[type] : '—'}
                </span>
                <Pin pinKey={pinOut} side="right" title={`Arraste a partir de ${col.name}`} tone="raw" active={activePin === pinOut} />
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && lod !== 'macro' && (
        <div className="flex items-center justify-between rounded-b-[13px] border-t border-slate-100 bg-[var(--rel-card-header)] px-3 py-1 text-[length:var(--rel-text-micro)] text-slate-600">
          <span>{columns.length} campos</span>
          {visible.length !== columns.length && <span>mostrando {visible.length}</span>}
        </div>
      )}
    </div>
  );
}

export const TableCard = memo(TableCardImpl);
