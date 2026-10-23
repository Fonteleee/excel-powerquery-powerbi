// src/components/Grid/GridContextMenu.tsx
// Menu de contexto (botão direito) da grade, posicionado dentro da janela.

import {
  Clipboard, Copy, FileSpreadsheet, Paintbrush, Palette, Scissors, Sparkles, Split, Trash2, Zap,
} from 'lucide-react';
import { CellPosition, Sheet } from '../../types/spreadsheet';
import { detectFlashFill, FlashFillPrediction } from '../../engine/flashFill';
import { exportSheetToExcel } from '../../utils/excelExporter';

export interface GridContextMenuProps {
  contextMenu: { x: number; y: number };
  sheet: Sheet;
  activeCell: CellPosition;
  onClose: () => void;
  handleCopySelection: (isCut?: boolean) => void;
  handlePasteSelection: () => void | Promise<void>;
  handleApplyFlashFill: (hint: FlashFillPrediction) => void;
  handleDeleteSelectedRows: () => void;
  clearSelectedCells: () => void;
  onOpenFormatModal?: () => void;
  onOpenQuickAnalysis: () => void;
  onOpenTextToColumns: () => void;
  onOpenConditionalModal: () => void;
}

export function GridContextMenu(props: GridContextMenuProps) {
  const {
    contextMenu, sheet, activeCell, onClose, handleCopySelection, handlePasteSelection, handleApplyFlashFill,
    handleDeleteSelectedRows, clearSelectedCells, onOpenFormatModal, onOpenQuickAnalysis, onOpenTextToColumns,
    onOpenConditionalModal,
  } = props;
      const menuWidth = 260;
      const menuHeight = 440;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const clampedX = Math.max(12, Math.min(contextMenu.x, winW - menuWidth - 16));
      const clampedY = Math.max(12, Math.min(contextMenu.y, winH - menuHeight - 16));

      return (
        <div
          style={{ top: `${clampedY}px`, left: `${clampedX}px` }}
          className="fixed z-50 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 text-xs text-slate-700 animate-in fade-in duration-100 max-h-[calc(100vh-32px)] overflow-y-auto"
          onClick={() => onClose()}
        >
          <button
            onClick={() => handleCopySelection(false)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Copy className="size-3.5 text-slate-600" />
              Copiar
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+C</kbd>
          </button>

          <button
            onClick={handlePasteSelection}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Clipboard className="size-3.5 text-slate-600" />
              Colar
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+V</kbd>
          </button>

          <button
            onClick={() => handleCopySelection(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Scissors className="size-3.5 text-slate-600" />
              Recortar
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+X</kbd>
          </button>

          <div className="h-px bg-slate-200 my-1" />

          {/* Formatar Células / Cores & Tipos */}
          {onOpenFormatModal && (
            <button
              onClick={onOpenFormatModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-indigo-50 hover:text-indigo-800 transition-colors text-left cursor-pointer font-bold text-indigo-700 btn-tactile"
            >
              <span className="flex items-center gap-2">
                <Paintbrush className="size-3.5 text-indigo-600" />
                Formatar Células / Cores & Tipos
              </span>
              <kbd className="text-[10px] bg-indigo-100 border border-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-mono font-bold">Ctrl+1</kbd>
            </button>
          )}

          <button
            onClick={onOpenQuickAnalysis}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-800 transition-colors text-left cursor-pointer font-bold text-emerald-700"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5" />
              Análise Rápida
            </span>
            <kbd className="text-[10px] text-emerald-800 font-mono font-bold">Ctrl+Q</kbd>
          </button>

          <button
            onClick={() => {
              const hint = detectFlashFill(sheet, activeCell.col, activeCell.row);
              if (hint) handleApplyFlashFill(hint);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Zap className="size-3.5 text-amber-600" />
              Preenchimento Relâmpago
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+E</kbd>
          </button>

          <button
            onClick={onOpenTextToColumns}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <Split className="size-3.5 text-purple-600" />
            Dividir por Delimitador
          </button>

          <button
            onClick={onOpenConditionalModal}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <Palette className="size-3.5 text-emerald-700" />
            Formatação Condicional
          </button>

          <div className="h-px bg-slate-200 my-1" />

          <button
            onClick={() => exportSheetToExcel(sheet, sheet.name)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-800 transition-colors text-left cursor-pointer font-bold text-slate-800"
          >
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="size-3.5 text-emerald-700" />
              Exportar para Excel (.XLSX)
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+S</kbd>
          </button>

          <button
            onClick={handleDeleteSelectedRows}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-rose-50 hover:text-rose-700 transition-colors text-left cursor-pointer text-rose-700 font-semibold"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="size-3.5" />
              Excluir Linha(s) Selecionada(s)
            </span>
            <kbd className="text-[10px] text-rose-600 font-mono font-bold">Ctrl+-</kbd>
          </button>

          <button
            onClick={clearSelectedCells}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors text-left cursor-pointer font-medium"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="size-3.5 text-slate-500" />
              Limpar Conteúdo das Células
            </span>
            <kbd className="text-[10px] text-slate-400 font-mono">Del</kbd>
          </button>
        </div>
      );
}
