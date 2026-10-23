// src/features/relations/ui/export/FlowExportPopover.tsx
// Botão "Exportar" da barra do canvas: abre o FlowExportMenu (SQL e fluxo no Excel) num painel flutuante,
// ligado ao grafo e às planilhas reais da tela. Fecha com Esc ou clique fora.

import React, { useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Sheet } from '../../../../types/spreadsheet';
import { FlowGraph } from '../../model/graph';
import { FlowExportMenu } from './FlowExportMenu';

export interface FlowExportPopoverProps {
  graph: FlowGraph;
  sheets: readonly Sheet[];
  onImportGraph: (graph: FlowGraph) => void;
  fileBase?: string;
}

export const FlowExportPopover: React.FC<FlowExportPopoverProps> = ({ graph, sheets, onImportGraph, fileBase }) => {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          // Em janelas estreitas o painel de 440px cortaria à esquerda: alinha pela borda esquerda do botão.
          setAlignLeft(rect ? rect.right - Math.min(440, window.innerWidth * 0.9) < 8 : false);
          setOpen(v => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Exportar o fluxo como SQL ou Excel, ou importar um fluxo"
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[length:var(--rel-text-body)] font-bold text-slate-900 transition-colors hover:bg-slate-50"
      >
        <FileDown className="size-4" aria-hidden /> Exportar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onPointerDown={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Exportar e importar fluxo"
            className={`rel-popover absolute ${alignLeft ? 'left-0' : 'right-0'} top-full z-40 mt-1 max-h-[70vh] w-[min(440px,90vw)] overflow-y-auto p-3`}
          >
            <FlowExportMenu graph={graph} sheets={sheets} onImportGraph={onImportGraph} fileBase={fileBase} />
          </div>
        </>
      )}
    </div>
  );
};
