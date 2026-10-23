// src/components/Grid/GridOverlays.tsx
// Botões flutuantes (Análise Rápida / Excel) e aviso do Preenchimento Relâmpago.

import { Download, Sparkles, Zap } from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { FlashFillPrediction } from '../../engine/flashFill';
import { exportSheetToExcel } from '../../utils/excelExporter';

export interface GridOverlaysProps {
  sheet: Sheet;
  hasMultipleSelection: boolean;
  multiSelectedCount: number;
  flashFillHint: FlashFillPrediction | null;
  onOpenQuickAnalysis: () => void;
  onApplyFlashFill: (hint: FlashFillPrediction) => void;
}

export function GridOverlays({
  sheet, hasMultipleSelection, multiSelectedCount, flashFillHint, onOpenQuickAnalysis, onApplyFlashFill,
}: GridOverlaysProps) {
  return (
    <>
      {hasMultipleSelection && (
        <div className="fixed bottom-14 right-8 z-30 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {multiSelectedCount > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white font-bold text-xs shadow-xl border border-slate-700 animate-in zoom-in-95">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{multiSelectedCount} células selecionadas (CTRL)</span>
            </div>
          )}

          <button
            onClick={() => exportSheetToExcel(sheet, `${sheet.name}_Selecao`)}
            title="Exportar dados direto para o Excel (.XLSX)"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs shadow-xl border border-slate-200 cursor-pointer transition-all hover:scale-105"
          >
            <Download className="size-3.5 text-emerald-700" />
            <span>Excel (.XLSX)</span>
          </button>

          <button
            onClick={onOpenQuickAnalysis}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xl transition-all hover:scale-105 cursor-pointer border border-emerald-500"
          >
            <Sparkles className="size-4" />
            <span>Análise Rápida</span>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-700 text-emerald-100 text-[10px] font-mono font-bold">
              Ctrl+Q
            </span>
          </button>
        </div>
      )}
      {flashFillHint && (
        <div className="fixed bottom-14 left-8 z-30 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 p-3 px-4 rounded-2xl bg-white border border-emerald-500/40 shadow-2xl">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Preenchimento Relâmpago detectado!</span>
                <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-emerald-800 text-[10px] font-mono border border-slate-300">
                  Ctrl+E
                </span>
              </div>
              <p className="text-[11px] text-slate-600">{flashFillHint.patternDescription}</p>
            </div>
            <button
              onClick={() => onApplyFlashFill(flashFillHint)}
              className="ml-2 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              Preencher {flashFillHint.predictedValues.length} linhas
            </button>
          </div>
        </div>
      )}
    </>
  );
}
