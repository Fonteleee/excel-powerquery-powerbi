// src/features/relations/ui/DataHealthPanel.tsx
// Data Health HUD: painel translúcido com a saúde da tabela selecionada e as correções propostas.
// A análise roda só enquanto o painel está aberto; a prévia é calculada sob demanda por correção.
// Aplicar delega a `onApply` (que grava pelo histórico de desfazer do App).

import React, { useMemo, useState } from 'react';
import { HeartPulse, X } from 'lucide-react';
import { Sheet } from '../../../types/spreadsheet';
import { analyzeSheetHealth } from '../analysis/health';
import type { HealthFix, ProposedFix } from '../analysis/healthTypes';
import { FixEffect, previewFixEffect, summarizeHealth } from './healthModel';

export interface DataHealthPanelProps {
  sheet: Sheet | null;
  onApply: (sheetId: string, fix: HealthFix) => string | null;
  onClose: () => void;
  /** Desfaz a última alteração das planilhas (histórico do App). */
  onUndo?: () => void;
  /** Afasta o painel da borda direita quando outro painel lateral está aberto. */
  rightOffset?: number;
}

export const DataHealthPanel: React.FC<DataHealthPanelProps> = ({ sheet, onApply, onClose, onUndo, rightOffset = 16 }) => {
  const health = useMemo(() => (sheet ? analyzeSheetHealth(sheet) : null), [sheet]);
  const summary = useMemo(() => (health ? summarizeHealth(health) : null), [health]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const effect: FixEffect | null = useMemo(() => {
    const proposed = health?.fixes.find(f => f.id === previewId);
    return sheet && proposed ? previewFixEffect(sheet, proposed.fix) : null;
  }, [sheet, health, previewId]);

  const apply = (proposed: ProposedFix): void => {
    if (!sheet) return;
    const error = onApply(sheet.id, proposed.fix);
    setNotice(error ?? `Aplicado: ${proposed.title}.`);
    setCanUndo(error === null && !!onUndo);
    setPreviewId(null);
  };

  return (
    <aside
      aria-label="Saúde dos dados"
      className="rel-popover absolute top-3 z-30 max-h-[calc(100%-24px)] w-[340px] overflow-y-auto p-3 backdrop-blur-md"
      style={{ right: rightOffset, background: 'color-mix(in srgb, var(--rel-card) 90%, transparent)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <HeartPulse className="size-4 text-emerald-700" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-[length:var(--rel-text-label)] font-extrabold">
          Saúde dos dados{summary ? `: ${summary.sheetName}` : ''}
        </h2>
        <button type="button" onClick={onClose} aria-label="Fechar painel de saúde" className="flex size-6 items-center justify-center rounded-md hover:bg-slate-200">
          <X className="size-4" />
        </button>
      </div>

      {!health || !summary ? (
        <p className="text-[length:var(--rel-text-body)] text-slate-700">Selecione uma tabela no fluxo para analisar a planilha.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-1.5">
              <dt className="text-[length:var(--rel-text-micro)] font-semibold uppercase text-slate-600">Consistência</dt>
              <dd className="rel-num text-[length:var(--rel-text-heading)] font-extrabold">{summary.consistency}</dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/70 p-1.5">
              <dt className="text-[length:var(--rel-text-micro)] font-semibold uppercase text-slate-600">Completude</dt>
              <dd className="rel-num text-[length:var(--rel-text-heading)] font-extrabold">{summary.completeness}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[length:var(--rel-text-caption)] text-slate-700">{summary.headline}</p>

          {summary.problemColumns.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[length:var(--rel-text-caption)]">
              {summary.problemColumns.map(col => (
                <li key={col.header}>
                  <strong>{col.header}</strong>: {col.notes.join('; ')}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-3 text-[length:var(--rel-text-caption)] font-bold uppercase tracking-wide text-slate-700">Correções propostas</h3>
          {health.fixes.length === 0 && <p className="mt-1 text-[length:var(--rel-text-caption)] text-emerald-800">Nenhuma correção necessária.</p>}
          <ul className="mt-1 space-y-2">
            {health.fixes.map(proposed => (
              <li key={proposed.id} className="rounded-lg border border-slate-200 bg-white/70 p-2">
                <div className="text-[length:var(--rel-text-body)] font-bold">{proposed.title}</div>
                <div className="text-[length:var(--rel-text-caption)] text-slate-700">{proposed.description}</div>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    aria-pressed={previewId === proposed.id}
                    onClick={() => setPreviewId(prev => (prev === proposed.id ? null : proposed.id))}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[length:var(--rel-text-caption)] font-bold hover:bg-slate-50"
                  >
                    Prévia
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(proposed)}
                    className="rounded-md border border-emerald-800 bg-emerald-700 px-2 py-1 text-[length:var(--rel-text-caption)] font-bold text-white hover:bg-emerald-800"
                  >
                    Aplicar
                  </button>
                </div>
                {previewId === proposed.id && effect && (
                  <p role="status" className="mt-1.5 text-[length:var(--rel-text-caption)] text-slate-800">
                    {effect.text}
                    {effect.skipped.map((s, k) => (
                      <span key={k} className="block text-[var(--rel-warn)]">{s}</span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {notice && (
        <p role="status" className="mt-2 flex items-center gap-2 text-[length:var(--rel-text-caption)] font-semibold text-slate-800">
          <span className="min-w-0 flex-1">{notice}</span>
          {canUndo && onUndo && (
            <button
              type="button"
              onClick={() => { onUndo(); setCanUndo(false); setNotice('Correção desfeita.'); }}
              className="shrink-0 rounded-md border border-slate-400 bg-white px-2 py-1 font-bold hover:bg-slate-50"
            >
              Desfazer
            </button>
          )}
        </p>
      )}
    </aside>
  );
};
