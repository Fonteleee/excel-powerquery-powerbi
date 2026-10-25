// src/features/relations/ui/FormulaLinksPanel.tsx
// Ligações que o usuário já fez com fórmulas na aba de Dados (PROCX, PROCV, SOMASE...).
// Aparecem aqui sempre atualizadas e podem virar nós do fluxo com um clique.

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Link2, Sigma } from 'lucide-react';
import { getColumnHeaderName } from '../../../engine/relationFormulaEngine';
import { Sheet } from '../../../types/spreadsheet';
import { detectFormulaLinks, FN_LABEL, FormulaLink, linkToLegacyEdge } from '../analysis/formulaLinks';
import { FlowGraph } from '../model/graph';
import { migrateLegacyEdges } from '../model/legacy';

interface FormulaLinksPanelProps {
  sheets: readonly Sheet[];
  graph: FlowGraph;
  onBring: (link: FormulaLink) => void;
}

/** O fluxo já tem esta ligação quando trazê-la de novo não mudaria nada (a migração é idempotente). */
function alreadyInFlow(link: FormulaLink, sheets: readonly Sheet[], graph: FlowGraph): boolean {
  const migrated = migrateLegacyEdges([linkToLegacyEdge(link)], [...sheets], graph);
  return migrated.converted.length > 0 && migrated.graph.nodes.length === graph.nodes.length && migrated.graph.edges.length === graph.edges.length;
}

export const FormulaLinksPanel: React.FC<FormulaLinksPanelProps> = ({ sheets, graph, onBring }) => {
  const [open, setOpen] = useState(true);
  const links = useMemo(() => detectFormulaLinks(sheets), [sheets]);
  const names = useMemo(() => new Map(sheets.map(s => [s.id, s])), [sheets]);
  const status = useMemo(() => new Map(links.map(l => [l.id, alreadyInFlow(l, sheets, graph)])), [links, sheets, graph]);

  if (links.length === 0) return null;
  const pending = links.filter(l => !status.get(l.id)).length;

  return (
    <section
      aria-label="Ligações feitas com fórmulas na aba de Dados"
      className="absolute left-3 top-3 z-20 w-[min(360px,calc(100%-24px))] rounded-xl border border-slate-300 bg-white/95 text-[length:var(--rel-text-caption)] text-slate-800 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-bold"
      >
        <Sigma className="size-4 shrink-0 text-indigo-700" aria-hidden />
        <span className="flex-1">
          Fórmulas nos dados ({links.length}){pending > 0 ? ` · ${pending} fora do fluxo` : ' · todas no fluxo'}
        </span>
        {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      </button>
      {open && (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto border-t border-slate-200 p-2">
          {links.map(link => {
            const source = names.get(link.sheetId);
            const target = names.get(link.targetSheetId);
            if (!source || !target) return null;
            const done = status.get(link.id) === true;
            return (
              <li key={link.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-center gap-1 font-semibold text-slate-900">
                  <Link2 className="size-3.5 shrink-0 text-indigo-700" aria-hidden />
                  <span className="truncate">
                    {source.name}.{getColumnHeaderName(source, link.keyCol)} ⇄ {target.name}.{getColumnHeaderName(target, link.targetKeyCol)}
                  </span>
                </div>
                <div className="mt-0.5 text-slate-600">
                  {FN_LABEL[link.fn]}
                  {link.returnCol !== null ? ` → ${getColumnHeaderName(target, link.returnCol)}` : ''} · {link.exampleAddress} · {link.uses}×
                </div>
                <div className="mt-1.5">
                  {done ? (
                    <span className="font-bold text-emerald-800">✓ Já está no fluxo</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBring(link)}
                      className="rounded-md bg-indigo-700 px-2.5 py-1 font-bold text-white hover:bg-indigo-800"
                    >
                      Trazer para o fluxo
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
