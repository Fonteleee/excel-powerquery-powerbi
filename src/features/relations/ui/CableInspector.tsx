// src/features/relations/ui/CableInspector.tsx
// Micro-card de falhas do cabo de lookup (órfãos, nulos, tipos, duplicatas). Calculado só quando aparece
// (hover/foco no selo), com amostra curta e sem capturar o mouse, para não cobrir o diagrama.

import React, { useMemo } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { inspectLookup } from '../analysis/orphans';
import { FlowGraph } from '../model/graph';
import type { NodeResult } from '../runtime/evaluate';
import { formatCount } from './format';
import { buildInspectorSections, INSPECTOR_SAMPLE, InspectorTone } from './inspectorModel';

export interface InspectorAnchor {
  nodeId: string;
  /** Posição do selo em coordenadas da superfície (px). */
  x: number;
  y: number;
}

interface CableInspectorProps {
  graph: FlowGraph;
  results: ReadonlyMap<string, NodeResult>;
  anchor: InspectorAnchor;
  bounds: { width: number; height: number };
  id: string;
}

const WIDTH = 300;
const TONE_COLOR: Record<InspectorTone, string> = {
  danger: 'var(--rel-danger)',
  warn: 'var(--rel-warn)',
  info: 'var(--rel-ink)',
};

export const CableInspector: React.FC<CableInspectorProps> = ({ graph, results, anchor, bounds, id }) => {
  const outcome = useMemo(
    () => inspectLookup(graph, anchor.nodeId, results, { sampleLimit: INSPECTOR_SAMPLE }),
    [graph, results, anchor.nodeId]
  );
  const sections = outcome.ok ? buildInspectorSections(outcome.inspection) : [];
  const below = anchor.y < 220;
  const left = Math.max(8, Math.min(anchor.x - WIDTH / 2, bounds.width - WIDTH - 8));

  return (
    <div
      id={id}
      role="tooltip"
      className="rel-popover pointer-events-none absolute z-30 p-2.5"
      style={{
        width: WIDTH,
        left,
        top: below ? anchor.y + 22 : undefined,
        bottom: below ? undefined : bounds.height - anchor.y + 22,
        background: 'color-mix(in srgb, var(--rel-card) 94%, transparent)',
      }}
    >
      {!outcome.ok && <p className="text-[length:var(--rel-text-caption)] text-slate-700">{outcome.error}</p>}
      {outcome.ok && (
        <>
          <p className="mb-1 text-[length:var(--rel-text-caption)] font-bold">
            {formatCount(outcome.inspection.matchedRows)} de {formatCount(outcome.inspection.keyedRows)} linhas com chave encontraram correspondência
          </p>
          {sections.length === 0 && (
            <p className="flex items-center gap-1 text-[length:var(--rel-text-caption)] font-semibold text-emerald-800">
              <CircleCheck className="size-3.5" aria-hidden /> Nenhuma falha encontrada neste cruzamento.
            </p>
          )}
          {sections.map(section => (
            <div key={section.id} className="mt-1.5">
              <div className="flex items-center gap-1 text-[length:var(--rel-text-caption)] font-bold" style={{ color: TONE_COLOR[section.tone] }}>
                <TriangleAlert className="size-3" aria-hidden />
                {section.title}
                {section.total > 0 && <span className="rel-num">: {formatCount(section.total)}</span>}
              </div>
              <ul className="ml-4 list-disc text-[length:var(--rel-text-micro)] text-slate-800">
                {section.lines.map((line, k) => (
                  <li key={k} className="rel-num truncate">{line}</li>
                ))}
                {section.more > 0 && <li className="list-none text-slate-600">e mais {formatCount(section.more)}…</li>}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
