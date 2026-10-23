// src/features/relations/ui/LegacyBanner.tsx
// Aviso das relações antigas (fórmulas já gravadas nas planilhas). Oferece reconstruí-las como fluxo
// ou dispensar. Nada é apagado das planilhas em nenhum dos dois casos.

import React from 'react';
import { History, X } from 'lucide-react';
import { LegacyMigrationResult } from '../model/legacy';

interface LegacyBannerProps {
  count: number;
  report: LegacyMigrationResult | null;
  onRebuild: () => void;
  onDismiss: () => void;
}

export const LegacyBanner: React.FC<LegacyBannerProps> = ({ count, report, onRebuild, onDismiss }) => (
  <div
    role="status"
    className="absolute left-1/2 top-3 z-30 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[length:var(--rel-text-body)] text-amber-950 shadow-lg"
  >
    <History className="mt-0.5 size-5 shrink-0 text-amber-800" aria-hidden />
    <div className="min-w-0 flex-1">
      {report === null ? (
        <>
          <p className="font-bold">
            {count} {count === 1 ? 'relação antiga encontrada' : 'relações antigas encontradas'}
          </p>
          <p className="text-[length:var(--rel-text-caption)]">
            Elas gravaram fórmulas fixas nas planilhas. Você pode reconstruí-las como fluxo editável: o fluxo gera abas novas e não mexe nas colunas que já existem.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onRebuild} className="rounded-lg bg-amber-800 px-3 py-1.5 font-bold text-white hover:bg-amber-900">
              Reconstruir como fluxo
            </button>
            <button type="button" onClick={onDismiss} className="rounded-lg border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100">
              Dispensar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-bold">
            {report.converted.length} convertida(s), {report.skipped.length} mantida(s) como fórmula na planilha
          </p>
          {report.skipped.length > 0 && (
            <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 text-[length:var(--rel-text-caption)]">
              {report.skipped.map(s => (
                <li key={s.edgeId}>{s.reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[length:var(--rel-text-caption)]">Use “Executar fluxo” para gerar as abas de saída.</p>
        </>
      )}
    </div>
    <button type="button" onClick={onDismiss} aria-label="Fechar aviso" className="flex size-7 items-center justify-center rounded-lg hover:bg-amber-100">
      <X className="size-4" />
    </button>
  </div>
);
