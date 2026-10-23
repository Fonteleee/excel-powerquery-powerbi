// src/features/relations/ui/TransformNodeView.tsx
// Nó de transformação persistente (estilo n8n/Alteryx): hexágono para busca (lookup), cartão arredondado para
// agregar e filtrar. Clique abre o painel lateral; arraste move. Cor + ícone + rótulo (nunca só a cor).

import React, { memo, useRef } from 'react';
import { Funnel, Search, Sigma, TriangleAlert } from 'lucide-react';
import { TransformParams } from '../model/graph';
import type { NodeResult } from '../runtime/evaluate';
import { DetailLevel } from './geometry';
import { describeResult, summarizeTransform } from './nodeText';
import { Pin } from './Pin';
import { CABLES, CableTone, LAYOUT } from './tokens';
import { ReportAnchors, usePinMeasure } from './usePinMeasure';

interface TransformNodeViewProps {
  nodeId: string;
  x: number;
  y: number;
  label?: string;
  params: TransformParams;
  result: NodeResult | undefined;
  selected: boolean;
  lod: DetailLevel;
  zoom: number;
  connecting: boolean;
  activePin: string | null;
  report: ReportAnchors;
}

const W = LAYOUT.hexWidth;
const H = LAYOUT.hexHeight;

const HEX_POINTS = `44,3 ${W - 44},3 ${W - 3},${H / 2} ${W - 44},${H - 3} 44,${H - 3} 3,${H / 2}`;
const ROUND = { x: 3, y: 3, width: W - 6, height: H - 6, rx: 22 };

const TONE_BY_OP: Record<TransformParams['op'], CableTone> = {
  lookup: 'lookup',
  aggregate: 'aggregate',
  filter: 'raw',
};

const OP_ICON = {
  lookup: <Search className="size-4" aria-hidden />,
  aggregate: <Sigma className="size-4" aria-hidden />,
  filter: <Funnel className="size-4" aria-hidden />,
} as const;

function TransformNodeViewImpl(props: TransformNodeViewProps): React.ReactElement {
  const { nodeId, x, y, label, params, result, selected, lod, zoom, connecting, activePin, report } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const tone = TONE_BY_OP[params.op];
  const palette = CABLES[tone];
  const summary = summarizeTransform(params);
  const status = describeResult(result);
  const hasError = status.tone === 'error';
  const stroke = hasError ? CABLES.error.color : palette.color;
  const isLookup = params.op === 'lookup';

  usePinMeasure(rootRef, nodeId, zoom, report, `${params.op}|${lod}`);

  const statusColor =
    status.tone === 'error' ? 'text-[var(--rel-danger)]' : status.tone === 'warn' ? 'text-[var(--rel-warn)]' : 'text-slate-700';

  return (
    <div
      ref={rootRef}
      data-node-id={nodeId}
      data-drag-handle
      role="button"
      tabIndex={0}
      aria-label={`${summary.title}: ${summary.lines.join(', ')}. ${status.text}`}
      className="absolute left-0 top-0 cursor-grab select-none active:cursor-grabbing"
      style={{ width: W, height: H, transform: `translate3d(${x}px, ${y}px, 0)` }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
        {isLookup ? (
          <polygon
            points={HEX_POINTS}
            fill={palette.soft}
            stroke={stroke}
            strokeWidth={selected ? 3.5 : 2.5}
            strokeLinejoin="round"
            style={{ filter: selected ? `drop-shadow(0 0 8px ${palette.glow})` : `drop-shadow(0 2px 4px rgba(15,23,42,.18))` }}
          />
        ) : (
          <rect
            {...ROUND}
            fill={palette.soft}
            stroke={stroke}
            strokeWidth={selected ? 3.5 : 2.5}
            style={{ filter: selected ? `drop-shadow(0 0 8px ${palette.glow})` : `drop-shadow(0 2px 4px rgba(15,23,42,.18))` }}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-9 text-center">
        <div className="flex items-center gap-1.5" style={{ color: stroke }}>
          {hasError ? <TriangleAlert className="size-4" aria-hidden /> : OP_ICON[params.op]}
          <span className="text-[length:var(--rel-text-label)] font-extrabold leading-none text-[var(--rel-ink)]">
            {label ?? summary.title}
          </span>
        </div>
        {lod !== 'macro' && (
          <>
            <span className="rel-num text-[length:var(--rel-text-micro)] font-bold uppercase tracking-wider" style={{ color: stroke }}>
              {summary.excelName}
            </span>
            {summary.lines.map(line => (
              <span key={line} className="max-w-full truncate text-[length:var(--rel-text-caption)] leading-tight text-slate-800">
                {line}
              </span>
            ))}
            <span className={`max-w-full truncate text-[length:var(--rel-text-micro)] font-semibold leading-tight ${statusColor}`}>
              {status.text}
            </span>
          </>
        )}
      </div>

      <Pin
        pinKey="in:in"
        side="left"
        offset={isLookup ? 6 : -11}
        top={isLookup ? '30%' : '50%'}
        title="Entrada principal: tabela de origem"
        tone="raw"
        accepts={connecting}
      />
      {isLookup && (
        <Pin pinKey="in:lookup" side="left" offset={6} top="70%" title="Entrada de busca: tabela onde procurar" tone="lookup" accepts={connecting} />
      )}
      <Pin
        pinKey="out:*"
        side="right"
        offset={-11}
        title="Saída: arraste para uma saída ou outra transformação"
        tone={tone}
        active={activePin === 'out:*'}
      />
    </div>
  );
}

export const TransformNodeView = memo(TransformNodeViewImpl);
