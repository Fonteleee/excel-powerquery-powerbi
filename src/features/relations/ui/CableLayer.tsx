// src/features/relations/ui/CableLayer.tsx
// Camada SVG dos cabos (brilho, traço, pulsos animados) e camada HTML dos selos (contador de linhas e
// pré-validação de cardinalidade). Só vetor; os pulsos usam stroke-dashoffset (CSS) e respeitam
// `prefers-reduced-motion`. Sem WebGL.

import React, { memo } from 'react';
import { Database, Link2, Sigma, TriangleAlert, X } from 'lucide-react';
import { CableKind, CableProblem, cardinalityNote } from '../analysis/cableStatus';
import type { LookupStats } from '../runtime/evaluate';
import { formatCount, formatPercent } from './format';
import { DetailLevel, Point } from './geometry';
import { CABLES, CableTone } from './tokens';

export interface CableView {
  id: string;
  d: string;
  mid: Point;
  kind: CableKind;
  problem: CableProblem;
  rows: number | null;
  lookup?: LookupStats;
  message?: string;
  selected: boolean;
  /** Nó lookup dono das estatísticas (alvo do cabo de entrada); habilita o inspetor de falhas. */
  lookupNodeId?: string;
}

export interface DraftView {
  d: string;
}

const MAX_ANIMATED = 80;

export const toneOf = (cable: Pick<CableView, 'kind' | 'problem'>): CableTone =>
  cable.problem === 'none' ? cable.kind : 'error';

interface CableLayerProps {
  cables: CableView[];
  draft: DraftView | null;
  onSelect: (edgeId: string) => void;
}

function CableLayerImpl({ cables, draft, onSelect }: CableLayerProps): React.ReactElement {
  const animate = cables.length <= MAX_ANIMATED;
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
      {cables.map(cable => {
        const tone = CABLES[toneOf(cable)];
        return (
          <g key={cable.id}>
            <path className="rel-cable" d={cable.d} stroke={tone.glow} strokeWidth={cable.selected ? 14 : 9} opacity={0.35} />
            <path
              className="rel-cable"
              d={cable.d}
              data-problem={cable.problem === 'none' ? undefined : cable.problem}
              stroke={tone.color}
              strokeWidth={cable.selected ? 4 : 3}
            />
            {animate && cable.rows !== 0 && cable.problem !== 'error' && (
              <path className="rel-pulse" d={cable.d} stroke="#ffffff" strokeWidth={2} opacity={0.95} />
            )}
            <path
              className="rel-cable-hit"
              d={cable.d}
              onPointerDown={e => {
                e.stopPropagation();
                onSelect(cable.id);
              }}
            >
              <title>{cable.message ?? CABLES[toneOf(cable)].label}</title>
            </path>
          </g>
        );
      })}
      {draft && (
        <path className="rel-cable" d={draft.d} stroke={CABLES.lookup.color} strokeWidth={3} strokeDasharray="6 6" opacity={0.9} />
      )}
    </svg>
  );
}

export const CableLayer = memo(CableLayerImpl);

const KIND_ICON: Record<CableKind, React.ReactNode> = {
  raw: <Database className="size-3" aria-hidden />,
  lookup: <Link2 className="size-3" aria-hidden />,
  aggregate: <Sigma className="size-3" aria-hidden />,
};

const KIND_LABEL: Record<CableKind, string> = {
  raw: 'dados brutos',
  lookup: 'busca',
  aggregate: 'agregação',
};

interface BadgeProps {
  cable: CableView;
  lod: DetailLevel;
  onRemove: (edgeId: string) => void;
  onSelect: (edgeId: string) => void;
  /** Mostra (el) ou esconde (null) o inspetor de falhas; chamado por hover e foco. */
  onInspect?: (cable: CableView, el: HTMLElement | null) => void;
  inspectorId?: string;
  inspecting?: boolean;
}

function CableBadgeImpl({ cable, lod, onRemove, onSelect, onInspect, inspectorId, inspecting }: BadgeProps): React.ReactElement {
  const tone = CABLES[toneOf(cable)];
  const stats = cable.lookup;
  const note = stats ? cardinalityNote(stats) : null;
  const compact = lod === 'macro';
  const inspectable = !!stats && !!cable.lookupNodeId && !!onInspect;

  return (
    <div
      data-badge
      className="rel-badge"
      style={{ left: cable.mid.x, top: cable.mid.y }}
      onPointerDown={e => {
        e.stopPropagation();
        onSelect(cable.id);
      }}
    >
      <div
        className="flex items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[length:var(--rel-text-caption)] font-semibold shadow-md"
        style={{ borderColor: tone.color, color: 'var(--rel-ink)' }}
        title={inspectable ? undefined : cable.message ?? tone.label}
        tabIndex={inspectable ? 0 : undefined}
        role={inspectable ? 'button' : undefined}
        aria-label={inspectable ? `Inspecionar falhas do cruzamento: ${cable.message ?? 'sem órfãos'}` : undefined}
        aria-describedby={inspectable && inspecting ? inspectorId : undefined}
        onPointerEnter={inspectable ? e => onInspect?.(cable, e.currentTarget) : undefined}
        onPointerLeave={inspectable ? () => onInspect?.(cable, null) : undefined}
        onFocus={inspectable ? e => onInspect?.(cable, e.currentTarget) : undefined}
        onBlur={inspectable ? () => onInspect?.(cable, null) : undefined}
        onKeyDown={inspectable ? e => { if (e.key === 'Escape') onInspect?.(cable, null); } : undefined}
      >
        <span style={{ color: tone.color }} className="flex items-center gap-1">
          {cable.problem === 'none' ? KIND_ICON[cable.kind] : <TriangleAlert className="size-3" aria-hidden />}
        </span>

        {stats && !compact ? (
          <>
            <span className="rel-num font-bold">{formatPercent(stats.matchRate)}</span>
            <span className="text-slate-700">de match</span>
            <span className="text-slate-400" aria-hidden>
              ·
            </span>
            <span className="rel-num" style={{ color: stats.orphans > 0 ? CABLES.error.color : undefined }}>
              {stats.orphans === 0 ? 'sem órfãos' : `${formatCount(stats.orphans)} órfãos`}
            </span>
            {note && (
              <span
                className="rel-num rounded bg-slate-100 px-1 font-bold text-slate-800"
                title={note.warning ?? `Cardinalidade ${note.label}`}
              >
                {note.label}
              </span>
            )}
            {note?.warning && (
              <span title={note.warning} role="img" aria-label={note.warning} className="text-[var(--rel-warn)]">
                <TriangleAlert className="size-3" aria-hidden />
              </span>
            )}
          </>
        ) : (
          <span className="rel-num">
            {cable.problem === 'error'
              ? 'erro'
              : cable.rows === null
                ? '—'
                : `${formatCount(cable.rows)}${compact ? '' : ' linhas'}`}
          </span>
        )}
        {!compact && cable.problem === 'none' && !stats && <span className="sr-only">{KIND_LABEL[cable.kind]}</span>}

        {cable.selected && (
          <button
            type="button"
            aria-label="Remover ligação"
            title="Remover ligação"
            onClick={() => onRemove(cable.id)}
            className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export const CableBadge = memo(CableBadgeImpl);
