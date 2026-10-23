// src/features/relations/ui/OutputNodeView.tsx
// Nó de saída: a aba que o fluxo materializa (`flow-out-<id>`). Mostra o estado: pendente, atualizada ou com erro.

import React, { memo, useRef } from 'react';
import { CircleCheck, Clock, FileOutput, TriangleAlert } from 'lucide-react';
import type { NodeResult } from '../runtime/evaluate';
import { formatCount } from './format';
import { DetailLevel } from './geometry';
import { Pin } from './Pin';
import { LAYOUT } from './tokens';
import { ReportAnchors, usePinMeasure } from './usePinMeasure';

export type OutputStatus = 'pending' | 'stale' | 'fresh';

interface OutputNodeViewProps {
  nodeId: string;
  x: number;
  y: number;
  sheetName: string;
  result: NodeResult | undefined;
  status: OutputStatus;
  selected: boolean;
  lod: DetailLevel;
  zoom: number;
  connecting: boolean;
  report: ReportAnchors;
}

const STATUS_TEXT: Record<OutputStatus, string> = {
  pending: 'Ainda não executada',
  stale: 'Desatualizada — execute o fluxo',
  fresh: 'Aba atualizada',
};

function OutputNodeViewImpl(props: OutputNodeViewProps): React.ReactElement {
  const { nodeId, x, y, sheetName, result, status, selected, lod, zoom, connecting, report } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  usePinMeasure(rootRef, nodeId, zoom, report, lod);

  const error = result?.error ?? null;
  const rows = result?.table?.rows.length ?? null;
  const icon = error ? (
    <TriangleAlert className="size-4 text-[var(--rel-danger)]" aria-hidden />
  ) : status === 'fresh' ? (
    <CircleCheck className="size-4 text-[var(--rel-ok)]" aria-hidden />
  ) : (
    <Clock className="size-4 text-[var(--rel-warn)]" aria-hidden />
  );

  return (
    <div
      ref={rootRef}
      data-node-id={nodeId}
      data-drag-handle
      role="button"
      tabIndex={0}
      aria-label={`Saída ${sheetName}. ${error ?? STATUS_TEXT[status]}`}
      className="rel-card absolute left-0 top-0 cursor-grab select-none active:cursor-grabbing"
      data-selected={selected ? 'true' : undefined}
      data-error={error ? 'true' : undefined}
      style={{ width: LAYOUT.outputWidth, transform: `translate3d(${x}px, ${y}px, 0)`, borderColor: error ? undefined : '#047857' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800">
          <FileOutput className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[length:var(--rel-text-label)] font-bold" title={sheetName}>
            {sheetName}
          </div>
          {lod !== 'macro' && (
            <div className="flex items-center gap-1 text-[length:var(--rel-text-caption)] text-slate-700">
              {icon}
              <span className="truncate" title={error ?? undefined}>
                {error ? (result?.rootCause ?? error) : STATUS_TEXT[status]}
              </span>
            </div>
          )}
        </div>
      </div>
      {lod !== 'macro' && rows !== null && (
        <div className="rel-num rounded-b-[13px] border-t border-slate-100 bg-[var(--rel-card-header)] px-3 py-1 text-[length:var(--rel-text-micro)] text-slate-700">
          {formatCount(rows)} linhas · {result?.table?.headers.length ?? 0} colunas → nova aba
        </div>
      )}
      <Pin pinKey="in:in" side="left" offset={-14} title="Entrada: ligue uma tabela ou transformação" tone="raw" accepts={connecting} />
    </div>
  );
}

export const OutputNodeView = memo(OutputNodeViewImpl);
