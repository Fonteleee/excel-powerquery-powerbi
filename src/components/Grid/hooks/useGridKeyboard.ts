// src/components/Grid/hooks/useGridKeyboard.ts
// Atalhos de teclado da grade (copiar/colar, formatação, navegação, Ctrl+setas e Ctrl+Shift+setas).

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { CellData, CellFormat, CellPosition, CellRange, Sheet } from '../../../types/spreadsheet';
import { FlashFillPrediction } from '../../../engine/flashFill';
import { cellPosToKey } from '../../../engine/formulaParser';
import { exportSheetToExcel } from '../../../utils/excelExporter';
import { computeEdgeJump, Direction } from '../../../utils/edgeJump';

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export interface GridKeyboardContext {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  selectionAnchor: CellPosition;
  isEditing: boolean;
  clipboard: unknown;
  multiSelectedKeys: Set<string>;
  flashFillHint: FlashFillPrediction | null;
  lastEscTimeRef: MutableRefObject<number>;
  onUpdateSheet: (sheet: Sheet) => void;
  onSelectCell: (pos: CellPosition) => void;
  onSelectRange: (range: CellRange) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenQuickAnalysis: () => void;
  onOpenFindReplace?: () => void;
  onClearSearchFilter?: () => void;
  setClipboard: (value: null) => void;
  setOpenFilterCol: (col: number | null) => void;
  setMultiSelectedKeys: (keys: Set<string>) => void;
  setContextMenu: (value: null) => void;
  setFlashFillHint: (value: FlashFillPrediction | null) => void;
  setSelectionAnchor: (pos: CellPosition) => void;
  setFilterClearedToast: (value: boolean) => void;
  handleCopySelection: (isCut?: boolean) => void;
  handlePasteSelection: () => void | Promise<void>;
  handleToggleFormat: (patch: Partial<CellFormat>) => void;
  handleApplyFlashFill: (hint: FlashFillPrediction) => void;
  handleDeleteSelectedRows: () => void;
  startEditing: (initial?: string) => void;
  clearSelectedCells: () => void;
}

export function useGridKeyboard(ctx: GridKeyboardContext): void {
  const {
    sheet, activeCell, selectedRange, selectionAnchor, isEditing, clipboard, multiSelectedKeys, flashFillHint,
    lastEscTimeRef, onUpdateSheet, onSelectCell, onSelectRange, onUndo, onRedo, onOpenQuickAnalysis,
    onOpenFindReplace, onClearSearchFilter, setClipboard, setOpenFilterCol, setMultiSelectedKeys, setContextMenu,
    setFlashFillHint, setSelectionAnchor, setFilterClearedToast, handleCopySelection, handlePasteSelection,
    handleToggleFormat, handleApplyFlashFill, handleDeleteSelectedRows, startEditing, clearSelectedCells,
  } = ctx;

  const isFilled = (r: number, c: number): boolean => {
    const cell: CellData | undefined = sheet.data[cellPosToKey(r, c)];
    return Boolean(cell && cell.value !== null && cell.value !== undefined && cell.value !== '');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Ignore if user is typing into any input, textarea, select, modal, or sidebar
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' ||
         target.isContentEditable ||
         target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], aside, form, .modal-backdrop'))
      ) {
        return;
      }

      if (isEditing) return;


      // ESCAPE: Double ESC clears all active filters! Single ESC clears selection/modals
      if (e.key === 'Escape') {
        e.preventDefault();
        const now = Date.now();
        const timeDiff = now - lastEscTimeRef.current;
        lastEscTimeRef.current = now;

        setClipboard(null);

        // Check if double ESC was pressed (< 500ms and > 30ms)
        if (timeDiff < 500 && timeDiff > 30) {
          // Double ESC: Clear all active column filters & search query!
          setOpenFilterCol(null);
          setMultiSelectedKeys(new Set());
          setContextMenu(null);
          setFlashFillHint(null);

          if (sheet.filters && Object.keys(sheet.filters).length > 0) {
            onUpdateSheet({
              ...sheet,
              filters: {},
              filterEnabled: false,
            });
          }

          if (onClearSearchFilter) {
            onClearSearchFilter();
          }

          // Show floating toast confirmation
          setFilterClearedToast(true);
          setTimeout(() => setFilterClearedToast(false), 2200);
          return;
        }

        // Single ESC: Normal Excel escape behavior (clear selection, close popups)
        setMultiSelectedKeys(new Set());
        onSelectRange({
          startRow: activeCell.row,
          startCol: activeCell.col,
          endRow: activeCell.row,
          endCol: activeCell.col,
        });
        setSelectionAnchor(activeCell);
        setContextMenu(null);
        setFlashFillHint(null);
        setOpenFilterCol(null);
        return;
      }

      // CTRL + C: Copiar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {

        e.preventDefault();
        handleCopySelection(false);
        return;
      }

      // CTRL + V: Colar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handlePasteSelection();
        return;
      }

      // CTRL + X: Recortar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        handleCopySelection(true);
        return;
      }

      // CTRL + Z: Desfazer
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        onUndo();
        return;
      }

      // CTRL + Y or CTRL + SHIFT + Z: Refazer
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        onRedo();
        return;
      }

      // CTRL + S: Exportação rápida para Excel (.xlsx)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        exportSheetToExcel(sheet, sheet.name);
        return;
      }

      // CTRL + B: Negrito
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        const currentBold = sheet.data[cellPosToKey(activeCell.row, activeCell.col)]?.format?.bold;
        handleToggleFormat({ bold: !currentBold });
        return;
      }

      // CTRL + I: Itálico
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        const currentItalic = sheet.data[cellPosToKey(activeCell.row, activeCell.col)]?.format?.italic;
        handleToggleFormat({ italic: !currentItalic });
        return;
      }

      // CTRL + U: Sublinhado
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        const currentUnderline = sheet.data[cellPosToKey(activeCell.row, activeCell.col)]?.format?.underline;
        handleToggleFormat({ underline: !currentUnderline });
        return;
      }

      // CTRL + A: Selecionar tudo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        onSelectRange({
          startRow: 0,
          startCol: 0,
          endRow: Math.min(sheet.rowCount - 1, 30),
          endCol: Math.min(sheet.colCount - 1, 15),
        });
        return;
      }

      // CTRL + L or CTRL + F: Localizar e Substituir
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L' || e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        e.preventDefault();
        onOpenFindReplace?.();
        return;
      }

      // CTRL + Q: Análise Rápida (Quick Analysis Lens)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        onOpenQuickAnalysis();
        return;
      }

      // CTRL + E: Preenchimento Relâmpago (Flash Fill)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (flashFillHint) {
          handleApplyFlashFill(flashFillHint);
        }
        return;
      }

      // CTRL + SHIFT + L: Alternar Filtros
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        onUpdateSheet({
          ...sheet,
          filterEnabled: !sheet.filterEnabled,
        });
        return;
      }


      // Shift + Space: Selecionar a linha toda
      if (e.shiftKey && e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onSelectRange({
          startRow: activeCell.row,
          startCol: 0,
          endRow: activeCell.row,
          endCol: sheet.colCount - 1,
        });
        return;
      }

      // Ctrl + Space: Selecionar a coluna toda
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space' && !e.shiftKey) {
        e.preventDefault();
        onSelectRange({
          startRow: 0,
          startCol: activeCell.col,
          endRow: sheet.rowCount - 1,
          endCol: activeCell.col,
        });
        return;
      }


      // CTRL + - : Excluir Linhas Selecionadas
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleDeleteSelectedRows();
        return;
      }

      // CTRL (+ SHIFT) + ARROWS: salto até a borda dos dados / estende a seleção (Excel)
      const jumpDirection = ARROWS[e.key];
      if ((e.ctrlKey || e.metaKey) && jumpDirection) {
        e.preventDefault();
        const jump = computeEdgeJump({
          anchor: selectionAnchor,
          focus: activeCell,
          direction: jumpDirection,
          extend: e.shiftKey,
          rowCount: sheet.rowCount,
          colCount: sheet.colCount,
          isFilled,
        });
        onSelectCell(jump.active);
        onSelectRange(jump.range);
        if (!e.shiftKey) setSelectionAnchor(jump.anchor);
        return;
      }

      // Standard Arrow Navigation
      let newRow = activeCell.row;
      let newCol = activeCell.col;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        newRow = Math.max(0, newRow - 1);
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        newRow = Math.min(sheet.rowCount - 1, newRow + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newCol = Math.max(0, newCol - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        newCol = Math.min(sheet.colCount - 1, newCol + 1);
      } else if (e.key === 'F2') {
        e.preventDefault();
        startEditing();
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        clearSelectedCells();
        return;
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        startEditing(e.key);
        return;
      } else {
        return;
      }

      if (e.shiftKey) {
        const nextRange: CellRange = {
          startRow: Math.min(selectionAnchor.row, newRow),
          startCol: Math.min(selectionAnchor.col, newCol),
          endRow: Math.max(selectionAnchor.row, newRow),
          endCol: Math.max(selectionAnchor.col, newCol),
        };
        onSelectCell({ row: newRow, col: newCol });
        onSelectRange(nextRange);
      } else {
        setSelectionAnchor({ row: newRow, col: newCol });
        onSelectCell({ row: newRow, col: newCol });
        onSelectRange({
          startRow: newRow,
          startCol: newCol,
          endRow: newRow,
          endCol: newCol,
        });
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, isEditing, selectionAnchor, sheet, selectedRange, clipboard, multiSelectedKeys]);
}
