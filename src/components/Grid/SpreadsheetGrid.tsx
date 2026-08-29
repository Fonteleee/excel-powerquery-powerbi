import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  MoreVertical,
  Copy,
  Scissors,
  Clipboard,
  Plus,
  Trash2,
  Split,
  Palette,
  Table,
  BarChart2,
  Sigma,
  Download,
  FileSpreadsheet,
  ChevronDown,
  Key,
  Calendar,
  Clock,
  DollarSign,
  Hash,
  Type,
  Tag,
  User,
  CheckSquare,
  Paintbrush,
  FilterX,
} from 'lucide-react';
import { Filter as FilterIcon, Search as SearchIcon } from 'lucide-react';
import { Sheet, CellPosition, CellRange, CellData, CellFormat } from '../../types/spreadsheet';
import { AgentAction } from '../../engine/agentActionProtocol';
import { GridCell, FormulaCellHighlightInfo } from './GridCell';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import {
  colIndexToLabel,
  cellPosToKey,
  recalculateSheet,
  getCellValue,
  parseNumberSafely,
  shiftFormula,
  cellPosToAddress,
  rangeToAddress,
} from '../../engine/formulaParser';
import {
  insertOrUpdateReferenceInFormula,
  extractReferencesFromFormula,
} from '../../engine/formulaPointHelper';
import { detectFlashFill, FlashFillPrediction } from '../../engine/flashFill';
import { exportSheetToExcel } from '../../utils/excelExporter';

function getNocoColumnIcon(sheet: Sheet, colIdx: number): { icon: React.ReactNode; bg: string; label: string } {
  const headerCell = sheet.data[cellPosToKey(0, colIdx)];
  const title = String(headerCell?.value || '').toLowerCase();
  
  if (/hora|tempo|dura[cç]|perman|pausa|time/i.test(title)) {
    return { icon: <Clock className="size-2.5 text-sky-600" strokeWidth={2} />, bg: 'bg-sky-100 border border-sky-200', label: 'Hora' };
  }
  if (/data|nasc|admiss|date|criado|created/i.test(title)) {
    return { icon: <Calendar className="size-2.5 text-emerald-600" strokeWidth={2} />, bg: 'bg-emerald-100 border border-emerald-200', label: 'Data' };
  }
  if (/valor|sal[aá]|pre[cç]|custo|lucro|fatur|r\$|\$/i.test(title)) {
    return { icon: <DollarSign className="size-2.5 text-emerald-600" strokeWidth={2} />, bg: 'bg-emerald-100 border border-emerald-200', label: 'Moeda' };
  }
  if (colIdx === 0 || /id|c[oó]d|pk|chave/i.test(title)) {
    return { icon: <Key className="size-2.5 text-amber-600" strokeWidth={2} />, bg: 'bg-amber-100 border border-amber-200', label: 'ID' };
  }
  if (/agente|user|usuario|autor/i.test(title)) {
    return { icon: <User className="size-2.5 text-cyan-600" strokeWidth={2} />, bg: 'bg-cyan-100 border border-cyan-200', label: 'Usuário' };
  }
  if (/estado|status|motivo|tipo|setor/i.test(title)) {
    return { icon: <Tag className="size-2.5 text-indigo-600" strokeWidth={2} />, bg: 'bg-indigo-100 border border-indigo-200', label: 'Status' };
  }
  if (/num|qtd|total|quant|order|nc_/i.test(title) || typeof headerCell?.value === 'number') {
    return { icon: <Hash className="size-2.5 text-purple-600" strokeWidth={2} />, bg: 'bg-purple-100 border border-purple-200', label: 'Número' };
  }
  return { icon: <Type className="size-2.5 text-slate-500" strokeWidth={2} />, bg: 'bg-slate-100 border border-slate-200', label: 'Texto' };
}

interface SpreadsheetGridProps {
  sheet: Sheet;
  allSheets?: Sheet[];
  activeCell: CellPosition;
  selectedRange: CellRange;
  showGridlines?: boolean;
  zoomLevel?: number;
  onUpdateSheet: (sheet: Sheet) => void;
  onSelectCell: (pos: CellPosition) => void;
  onSelectRange: (range: CellRange) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenQuickAnalysis: () => void;
  onOpenFormulaWizard: () => void;
  onOpenTextToColumns: () => void;
  onOpenConditionalModal: () => void;
  onOpenCharts: () => void;
  onOpenFindReplace?: () => void;
  onExecuteAgentActions?: (actions: AgentAction[]) => void;
  onLoadTemplate?: (sheet: Sheet) => void;
  onOpenImportModal?: () => void;
  onToggleCopilot?: () => void;
  onToggleSummary?: () => void;
  onOpenFormatModal?: () => void;
  searchFilter?: string;
  onClearSearchFilter?: () => void;
}

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  sheet,
  allSheets = [],
  activeCell,
  selectedRange,
  showGridlines = true,
  zoomLevel = 100,
  onUpdateSheet,
  onSelectCell,
  onSelectRange,
  onUndo,
  onRedo,
  onOpenQuickAnalysis,
  onOpenFormulaWizard,
  onOpenTextToColumns,
  onOpenConditionalModal,
  onOpenCharts,
  onOpenFindReplace,
  onExecuteAgentActions,
  onLoadTemplate,
  onOpenImportModal,
  onToggleCopilot,
  onToggleSummary,
  onOpenFormatModal,
  searchFilter = '',
  onClearSearchFilter,
}) => {
  const handleAddRow = () => {
    onUpdateSheet({
      ...sheet,
      rowCount: sheet.rowCount + 1,
    });
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<CellPosition>(activeCell);
  // Multi-cell non-contiguous selection (CTRL+Click / Drag)
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isCtrlSelecting, setIsCtrlSelecting] = useState(false);
  const [isRowSelecting, setIsRowSelecting] = useState(false);
  const [rowSelectAnchor, setRowSelectAnchor] = useState<number | null>(null);
  const [isColSelecting, setIsColSelecting] = useState(false);
  const [colSelectAnchor, setColSelectAnchor] = useState<number | null>(null);
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillRange, setFillRange] = useState<CellRange | null>(null);

  // Formula Pointing & Reference Mode State (Excel-like mouse point-and-click / drag into formulas)
  const [isFormulaPointing, setIsFormulaPointing] = useState(false);
  const [pointAnchor, setPointAnchor] = useState<CellPosition | null>(null);

  // Computed Formula Reference Highlights (e.g. blue, red, purple, green argument highlights)
  const formulaHighlights = useMemo(() => {
    return (isEditing && editValue.startsWith('='))
      ? extractReferencesFromFormula(editValue)
      : [];
  }, [isEditing, editValue]);

  // Double ESC Filter Reset & Feedback State
  const lastEscTimeRef = useRef<number>(0);
  const [filterClearedToast, setFilterClearedToast] = useState(false);

  const [clipboard, setClipboard] = useState<{
    range: CellRange;
    data: { [relKey: string]: CellData };
    isCut: boolean;
  } | null>(null);

  // Column resizing state
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Row resizing state
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isOpen: boolean } | null>(null);

  // Flash Fill prediction notification
  const [flashFillHint, setFlashFillHint] = useState<FlashFillPrediction | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragAnchorRef = useRef<{ row: number; col: number; x: number; y: number; isDragStarted: boolean } | null>(null);

  // Calculate if multiple cells are selected (either contiguous range or multi-cell CTRL)
  const hasMultipleSelection = useMemo(() => {
    return (
      multiSelectedKeys.size > 1 ||
      selectedRange.startRow !== selectedRange.endRow ||
      selectedRange.startCol !== selectedRange.endCol
    );
  }, [selectedRange, multiSelectedKeys]);


  // Check Flash Fill hint upon cell edit
  useEffect(() => {
    if (!isEditing && activeCell) {
      const hint = detectFlashFill(sheet, activeCell.col, activeCell.row);
      setFlashFillHint(hint);
    }
  }, [sheet, activeCell, isEditing]);

  // Apply Flash Fill
  const handleApplyFlashFill = (hint: FlashFillPrediction) => {
    const updatedData = { ...sheet.data };
    hint.predictedValues.forEach(pv => {
      const key = cellPosToKey(pv.row, hint.targetCol);
      updatedData[key] = {
        raw: pv.value,
        value: pv.value,
        format: { ...sheet.data[cellPosToKey(activeCell.row, hint.targetCol)]?.format },
      };
    });

    const updated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(updated);
    setFlashFillHint(null);
  };

  // Copy selection to internal & native clipboard (CTRL+C)
  const handleCopySelection = (isCut = false) => {
    const clipData: { [relKey: string]: CellData } = {};
    const textRows: string[] = [];

    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      const rowVals: string[] = [];
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        const key = cellPosToKey(r, c);
        const cell = sheet.data[key];
        const relR = r - selectedRange.startRow;
        const relC = c - selectedRange.startCol;
        const relKey = `${relR},${relC}`;

        if (cell) {
          clipData[relKey] = JSON.parse(JSON.stringify(cell));
          rowVals.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : cell.raw);
        } else {
          rowVals.push('');
        }
      }
      textRows.push(rowVals.join('\t'));
    }

    setClipboard({
      range: { ...selectedRange },
      data: clipData,
      isCut,
    });

    // Copy to system clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textRows.join('\n')).catch(() => {});
    }
  };

  // Paste from clipboard (CTRL+V) with relative formula adjusting
  const handlePasteSelection = async () => {
    const updatedData = { ...sheet.data };
    const destRow = activeCell.row;
    const destCol = activeCell.col;

    if (clipboard && Object.keys(clipboard.data).length > 0) {
      const deltaR = destRow - clipboard.range.startRow;
      const deltaC = destCol - clipboard.range.startCol;

      for (const [relKey, cell] of Object.entries(clipboard.data)) {
        const [relRStr, relCStr] = relKey.split(',');
        const r = destRow + parseInt(relRStr, 10);
        const c = destCol + parseInt(relCStr, 10);

        if (r < sheet.rowCount && c < sheet.colCount) {
          let newRaw = cell.raw;
          // Adjust formula references if it's a formula and not a cut
          if (newRaw.startsWith('=') && !clipboard.isCut) {
            newRaw = shiftFormula(newRaw, deltaR, deltaC);
          }

          updatedData[cellPosToKey(r, c)] = {
            raw: newRaw,
            value: newRaw.startsWith('=') ? null : newRaw,
            format: cell.format ? { ...cell.format } : undefined,
          };
        }
      }

      // If cut mode, clear source cells
      if (clipboard.isCut) {
        for (let r = clipboard.range.startRow; r <= clipboard.range.endRow; r++) {
          for (let c = clipboard.range.startCol; c <= clipboard.range.endCol; c++) {
            if (!(r >= destRow && r < destRow + (clipboard.range.endRow - clipboard.range.startRow + 1) &&
                  c >= destCol && c < destCol + (clipboard.range.endCol - clipboard.range.startCol + 1))) {
              delete updatedData[cellPosToKey(r, c)];
            }
          }
        }
        setClipboard(null);
      }

      const recalculated = recalculateSheet({ ...sheet, data: updatedData });
      onUpdateSheet(recalculated);
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      // Fallback: paste from OS clipboard
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          const lines = clipText.split(/\r\n|\r|\n/);
          lines.forEach((line, rOffset) => {
            const cols = line.split('\t');
            cols.forEach((val, cOffset) => {
              const r = destRow + rOffset;
              const c = destCol + cOffset;
              if (r < sheet.rowCount && c < sheet.colCount) {
                updatedData[cellPosToKey(r, c)] = {
                  raw: val,
                  value: val.startsWith('=') ? null : val,
                };
              }
            });
          });
          const recalculated = recalculateSheet({ ...sheet, data: updatedData });
          onUpdateSheet(recalculated);
        }
      } catch {
        // clipboard access denied
      }
    }
  };

  // Toggle formatting on selection (CTRL+B, CTRL+I, CTRL+U)
  const handleToggleFormat = (patch: Partial<CellFormat>) => {
    const updatedData = { ...sheet.data };
    const keysToFormat = multiSelectedKeys.size > 0 ? Array.from(multiSelectedKeys) : [];
    if (keysToFormat.length === 0) {
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          keysToFormat.push(cellPosToKey(r, c));
        }
      }
    }

    keysToFormat.forEach(key => {
      const existing = updatedData[key] || { raw: '', value: '' };
      updatedData[key] = {
        ...existing,
        format: {
          ...existing.format,
          ...patch,
        },
      };
    });

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
  };


  // Keyboard navigation & Shortcuts
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


      // Helper to check if cell is non-empty
      const isCellFilled = (r: number, c: number) => {
        const cell = sheet.data[cellPosToKey(r, c)];
        return cell && cell.value !== null && cell.value !== undefined && cell.value !== '';
      };

      const findVerticalBoundary = (startR: number, c: number, dir: 'up' | 'down'): number => {
        const currentFilled = Boolean(isCellFilled(startR, c));
        if (dir === 'down') {
          let r = startR;
          if (currentFilled) {
            while (r + 1 < sheet.rowCount && isCellFilled(r + 1, c)) r++;
            return r;
          } else {
            while (r + 1 < sheet.rowCount && !isCellFilled(r + 1, c)) r++;
            return Math.min(sheet.rowCount - 1, r + 1);
          }
        } else {
          let r = startR;
          if (currentFilled) {
            while (r - 1 >= 0 && isCellFilled(r - 1, c)) r--;
            return r;
          } else {
            while (r - 1 >= 0 && !isCellFilled(r - 1, c)) r--;
            return Math.max(0, r - 1);
          }
        }
      };

      const findHorizontalBoundary = (r: number, startC: number, dir: 'left' | 'right'): number => {
        const currentFilled = Boolean(isCellFilled(r, startC));
        if (dir === 'right') {
          let c = startC;
          if (currentFilled) {
            while (c + 1 < sheet.colCount && isCellFilled(r, c + 1)) c++;
            return c;
          } else {
            while (c + 1 < sheet.colCount && !isCellFilled(r, c + 1)) c++;
            return Math.min(sheet.colCount - 1, c + 1);
          }
        } else {
          let c = startC;
          if (currentFilled) {
            while (c - 1 >= 0 && isCellFilled(r, c - 1)) c--;
            return c;
          } else {
            while (c - 1 >= 0 && !isCellFilled(r, c - 1)) c--;
            return Math.max(0, c - 1);
          }
        }
      };

      // CTRL + - : Excluir Linhas Selecionadas
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleDeleteSelectedRows();
        return;
      }

      // CTRL + SHIFT + ARROWS: Expandir seleção até o final dos dados / linha / coluna
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          let targetCol = findHorizontalBoundary(activeCell.row, selectedRange.endCol, 'right');
          if (targetCol <= selectedRange.endCol) {
            targetCol = sheet.colCount - 1; // Expand to entire sheet row
          }
          const nextRange: CellRange = {
            startRow: selectedRange.startRow,
            endRow: selectedRange.endRow,
            startCol: Math.min(selectionAnchor.col, targetCol),
            endCol: Math.max(selectionAnchor.col, targetCol),
          };
          onSelectCell({ row: activeCell.row, col: targetCol });
          onSelectRange(nextRange);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          let targetCol = findHorizontalBoundary(activeCell.row, selectedRange.startCol, 'left');
          if (targetCol >= selectedRange.startCol) {
            targetCol = 0;
          }
          const nextRange: CellRange = {
            startRow: selectedRange.startRow,
            endRow: selectedRange.endRow,
            startCol: Math.min(selectionAnchor.col, targetCol),
            endCol: Math.max(selectionAnchor.col, targetCol),
          };
          onSelectCell({ row: activeCell.row, col: targetCol });
          onSelectRange(nextRange);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          let targetRow = findVerticalBoundary(selectedRange.endRow, activeCell.col, 'down');
          if (targetRow <= selectedRange.endRow) {
            targetRow = sheet.rowCount - 1; // Expand to bottom of sheet
          }
          const nextRange: CellRange = {
            startRow: Math.min(selectionAnchor.row, targetRow),
            endRow: Math.max(selectionAnchor.row, targetRow),
            startCol: selectedRange.startCol,
            endCol: selectedRange.endCol,
          };
          onSelectCell({ row: targetRow, col: activeCell.col });
          onSelectRange(nextRange);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          let targetRow = findVerticalBoundary(selectedRange.startRow, activeCell.col, 'up');
          if (targetRow >= selectedRange.startRow) {
            targetRow = 0;
          }
          const nextRange: CellRange = {
            startRow: Math.min(selectionAnchor.row, targetRow),
            endRow: Math.max(selectionAnchor.row, targetRow),
            startCol: selectedRange.startCol,
            endCol: selectedRange.endCol,
          };
          onSelectCell({ row: targetRow, col: activeCell.col });
          onSelectRange(nextRange);
          return;
        }
      }

      // CTRL + ARROWS: Pular para o limite de dados
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const targetRow = findVerticalBoundary(activeCell.row, activeCell.col, 'down');
          onSelectCell({ row: targetRow, col: activeCell.col });
          onSelectRange({ startRow: targetRow, startCol: activeCell.col, endRow: targetRow, endCol: activeCell.col });
          setSelectionAnchor({ row: targetRow, col: activeCell.col });
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const targetRow = findVerticalBoundary(activeCell.row, activeCell.col, 'up');
          onSelectCell({ row: targetRow, col: activeCell.col });
          onSelectRange({ startRow: targetRow, startCol: activeCell.col, endRow: targetRow, endCol: targetRow });
          setSelectionAnchor({ row: targetRow, col: activeCell.col });
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const targetCol = findHorizontalBoundary(activeCell.row, activeCell.col, 'right');
          onSelectCell({ row: activeCell.row, col: targetCol });
          onSelectRange({ startRow: activeCell.row, startCol: targetCol, endRow: activeCell.row, endCol: targetCol });
          setSelectionAnchor({ row: activeCell.row, col: targetCol });
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const targetCol = findHorizontalBoundary(activeCell.row, activeCell.col, 'left');
          onSelectCell({ row: activeCell.row, col: targetCol });
          onSelectRange({ startRow: activeCell.row, startCol: targetCol, endRow: activeCell.row, endCol: targetCol });
          setSelectionAnchor({ row: activeCell.row, col: targetCol });
          return;
        }
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

  const startEditing = (initialVal?: string) => {
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const existing = sheet.data[key];
    setEditValue(initialVal !== undefined ? initialVal : existing?.raw || '');
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (!isEditing) return;
    setIsEditing(false);
    setIsFormulaPointing(false);
    setPointAnchor(null);
    setColSelectAnchor(null);
    setRowSelectAnchor(null);

    const key = cellPosToKey(activeCell.row, activeCell.col);
    const updatedData = { ...sheet.data };
    const prevCell = sheet.data[key];

    // If formula is incomplete (e.g. '=PROCX(B:B; C:C'), auto-close unclosed parentheses before calculating
    let finalFormula = editValue;
    if (finalFormula.startsWith('=')) {
      const openCount = (finalFormula.match(/\(/g) || []).length;
      const closeCount = (finalFormula.match(/\)/g) || []).length;
      if (openCount > closeCount) {
        finalFormula = finalFormula + ')'.repeat(openCount - closeCount);
      }
    }

    updatedData[key] = {
      raw: finalFormula,
      value: finalFormula.startsWith('=') ? null : finalFormula,
      format: prevCell?.format,
    };

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
  };

  // Delete entire selected rows completely
  const handleDeleteSelectedRows = () => {
    const rStart = selectedRange.startRow;
    const rEnd = selectedRange.endRow;
    const countToDelete = rEnd - rStart + 1;

    const updatedData: { [key: string]: CellData } = {};

    for (let r = 0; r < sheet.rowCount; r++) {
      if (r >= rStart && r <= rEnd) continue; // Skip deleted rows

      const targetR = r > rEnd ? r - countToDelete : r;
      for (let c = 0; c < sheet.colCount; c++) {
        const srcKey = cellPosToKey(r, c);
        const destKey = cellPosToKey(targetR, c);
        if (sheet.data[srcKey]) {
          updatedData[destKey] = sheet.data[srcKey];
        }
      }
    }

    const newRowCount = Math.max(10, sheet.rowCount - countToDelete);
    const recalculated = recalculateSheet({
      ...sheet,
      data: updatedData,
      rowCount: newRowCount,
    });
    onUpdateSheet(recalculated);
    onSelectCell({ row: Math.min(rStart, newRowCount - 1), col: activeCell.col });
    onSelectRange({
      startRow: Math.min(rStart, newRowCount - 1),
      startCol: 0,
      endRow: Math.min(rStart, newRowCount - 1),
      endCol: sheet.colCount - 1,
    });
    setMultiSelectedKeys(new Set());
  };

  // Clear cell contents in selectedRange and multiSelectedKeys
  const clearSelectedCells = () => {
    const updatedData = { ...sheet.data };
    const keysToClear = new Set<string>();

    // 1. Add any multi-selected keys
    multiSelectedKeys.forEach(k => keysToClear.add(k));

    // 2. ALWAYS add all cells from selectedRange
    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        keysToClear.add(cellPosToKey(r, c));
      }
    }

    keysToClear.forEach(key => {
      if (updatedData[key]) {
        updatedData[key] = {
          raw: '',
          value: '',
          format: updatedData[key].format,
        };
      }
    });

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
    setMultiSelectedKeys(new Set());
  };


  // Mouse handlers for cell selection
  const handleCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    if (e.button !== 0) return;
    if (contextMenu?.isOpen) setContextMenu(null);

    // POINTING / REFERENCE MODE: If currently editing a formula, clicking another cell inserts reference!
    if (isEditing && editValue.startsWith('=')) {
      if (row === activeCell.row && col === activeCell.col) {
        return; // Allow cursor positioning inside active cell input
      }
      e.preventDefault();
      e.stopPropagation();
      setIsFormulaPointing(true);
      setPointAnchor({ row, col });
      const cellAddr = cellPosToAddress({ row, col });
      const forceNewArg = Boolean(e.ctrlKey || e.metaKey);
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, cellAddr, false, forceNewArg);
      setEditValue(nextFormula);
      return;
    }

    if (!isEditing) {
      e.preventDefault(); // Prevents browser text drag interference
    }

    const key = cellPosToKey(row, col);

    if (e.shiftKey) {
      setIsCtrlSelecting(false);
      const startRow = Math.min(selectionAnchor.row, row);
      const endRow = Math.max(selectionAnchor.row, row);
      const startCol = Math.min(selectionAnchor.col, col);
      const endCol = Math.max(selectionAnchor.col, col);
      onSelectRange({ startRow, startCol, endRow, endCol });
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setIsCtrlSelecting(true);
      setMultiSelectedKeys(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      setSelectionAnchor({ row, col });
      onSelectCell({ row, col });
      setIsSelecting(true);
      return;
    }

    // Normal single click or deliberate drag start:
    // Strictly locks active selection to THIS single cell on initial click
    setIsCtrlSelecting(false);
    setMultiSelectedKeys(new Set());
    setSelectionAnchor({ row, col });
    onSelectCell({ row, col });
    onSelectRange({
      startRow: row,
      startCol: col,
      endRow: row,
      endCol: col,
    });
    setIsSelecting(false);
    dragAnchorRef.current = { row, col, x: e.clientX, y: e.clientY, isDragStarted: false };
  };

  const handleCellMouseEnter = (e: React.MouseEvent, row: number, col: number) => {
    // Pointing drag reference update (e.g. dragged from A2 to A10)
    if (isFormulaPointing && pointAnchor && (e.buttons & 1) === 1) {
      const r1 = Math.min(pointAnchor.row, row);
      const r2 = Math.max(pointAnchor.row, row);
      const c1 = Math.min(pointAnchor.col, col);
      const c2 = Math.max(pointAnchor.col, col);
      const refAddr = (r1 === r2 && c1 === c2)
        ? cellPosToAddress({ row: r1, col: c1 })
        : rangeToAddress({ startRow: r1, startCol: c1, endRow: r2, endCol: c2 });
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, refAddr, true);
      setEditValue(nextFormula);
      return;
    }

    // Hard guard: if primary mouse button (left-click) is NOT actively held down, cancel dragging immediately
    if ((e.buttons & 1) !== 1) {
      if (isFormulaPointing) {
        setIsFormulaPointing(false);
        setPointAnchor(null);
      }
      dragAnchorRef.current = null;
      if (isSelecting) setIsSelecting(false);
      if (isCtrlSelecting) setIsCtrlSelecting(false);
      if (isRowSelecting) setIsRowSelecting(false);
      if (isColSelecting) setIsColSelecting(false);
      if (isDraggingFill) {
        if (fillRange) {
          applyFillHandleDrag(fillRange);
        }
        setIsDraggingFill(false);
        setFillRange(null);
      }
      return;
    }

    if (isDraggingFill) {
      if (row >= selectedRange.endRow) {
        setFillRange({
          startRow: selectedRange.startRow,
          startCol: selectedRange.startCol,
          endRow: row,
          endCol: selectedRange.endCol,
        });
      }
      return;
    }

    // Only expand range if user deliberately dragged with mouse button down across cells
    if (dragAnchorRef.current) {
      if (row !== dragAnchorRef.current.row || col !== dragAnchorRef.current.col) {
        dragAnchorRef.current.isDragStarted = true;
        setIsSelecting(true);

        if (isCtrlSelecting) {
          const rMin = Math.min(dragAnchorRef.current.row, row);
          const rMax = Math.max(dragAnchorRef.current.row, row);
          const cMin = Math.min(dragAnchorRef.current.col, col);
          const cMax = Math.max(dragAnchorRef.current.col, col);

          setMultiSelectedKeys(prev => {
            const next = new Set(prev);
            for (let r = rMin; r <= rMax; r++) {
              for (let c = cMin; c <= cMax; c++) {
                next.add(cellPosToKey(r, c));
              }
            }
            return next;
          });
        } else {
          onSelectRange({
            startRow: Math.min(dragAnchorRef.current.row, row),
            startCol: Math.min(dragAnchorRef.current.col, col),
            endRow: Math.max(dragAnchorRef.current.row, row),
            endCol: Math.max(dragAnchorRef.current.col, col),
          });
        }
      }
    }
  };

  // Row header mouse drag selection handlers
  const handleRowHeaderMouseDown = (e: React.MouseEvent, rowIdx: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (isEditing && editValue.startsWith('=')) {
      setIsFormulaPointing(true);
      setRowSelectAnchor(rowIdx);
      const rowAddr = `${rowIdx + 1}:${rowIdx + 1}`;
      const forceNewArg = Boolean(e.ctrlKey || e.metaKey);
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, rowAddr, false, forceNewArg);
      setEditValue(nextFormula);
      return;
    }

    setIsRowSelecting(true);
    setRowSelectAnchor(rowIdx);
    setMultiSelectedKeys(new Set());
    onSelectCell({ row: rowIdx, col: 0 });
    onSelectRange({
      startRow: rowIdx,
      startCol: 0,
      endRow: rowIdx,
      endCol: sheet.colCount - 1,
    });
  };

  const handleRowHeaderMouseEnter = (e: React.MouseEvent, rowIdx: number) => {
    if (isFormulaPointing && rowSelectAnchor !== null && (e.buttons & 1) === 1) {
      const startR = Math.min(rowSelectAnchor, rowIdx);
      const endR = Math.max(rowSelectAnchor, rowIdx);
      const rowAddr = startR === endR ? `${startR + 1}:${startR + 1}` : `${startR + 1}:${endR + 1}`;
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, rowAddr, true);
      setEditValue(nextFormula);
      return;
    }

    if ((e.buttons & 1) !== 1) {
      if (isRowSelecting) {
        setIsRowSelecting(false);
        setRowSelectAnchor(null);
      }
      return;
    }
    if (isRowSelecting && rowSelectAnchor !== null) {
      const startR = Math.min(rowSelectAnchor, rowIdx);
      const endR = Math.max(rowSelectAnchor, rowIdx);
      onSelectRange({
        startRow: startR,
        startCol: 0,
        endRow: endR,
        endCol: sheet.colCount - 1,
      });
    }
  };

  // Column header mouse drag selection handlers
  const handleColHeaderMouseDown = (e: React.MouseEvent, colIdx: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (isEditing && editValue.startsWith('=')) {
      setIsFormulaPointing(true);
      setColSelectAnchor(colIdx);
      const colLabel = colIndexToLabel(colIdx);
      const colAddr = `${colLabel}:${colLabel}`;
      const forceNewArg = Boolean(e.ctrlKey || e.metaKey);
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, colAddr, false, forceNewArg);
      setEditValue(nextFormula);
      return;
    }

    setIsColSelecting(true);
    setColSelectAnchor(colIdx);
    setMultiSelectedKeys(new Set());
    onSelectCell({ row: 0, col: colIdx });
    onSelectRange({
      startRow: 0,
      startCol: colIdx,
      endRow: sheet.rowCount - 1,
      endCol: colIdx,
    });
  };

  const handleColHeaderMouseEnter = (e: React.MouseEvent, colIdx: number) => {
    if (isFormulaPointing && colSelectAnchor !== null && (e.buttons & 1) === 1) {
      const startC = Math.min(colSelectAnchor, colIdx);
      const endC = Math.max(colSelectAnchor, colIdx);
      const colLabel1 = colIndexToLabel(startC);
      const colLabel2 = colIndexToLabel(endC);
      const colAddr = startC === endC ? `${colLabel1}:${colLabel1}` : `${colLabel1}:${colLabel2}`;
      const nextFormula = insertOrUpdateReferenceInFormula(editValue, colAddr, true);
      setEditValue(nextFormula);
      return;
    }

    if ((e.buttons & 1) !== 1) {
      if (isColSelecting) {
        setIsColSelecting(false);
        setColSelectAnchor(null);
      }
      return;
    }
    if (isColSelecting && colSelectAnchor !== null) {
      const startC = Math.min(colSelectAnchor, colIdx);
      const endC = Math.max(colSelectAnchor, colIdx);
      onSelectRange({
        startRow: 0,
        startCol: startC,
        endRow: sheet.rowCount - 1,
        endCol: endC,
      });
    }
  };

  // Fill Handle logic
  const handleFillMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingFill(true);
  };

  // Double-click on corner fill handle: Auto-fill down to the end of adjacent column
  const handleFillDoubleClick = (startR: number, startC: number) => {
    // Scan adjacent column to find the bottom data boundary
    const adjCol = startC > 0 ? startC - 1 : startC + 1;
    let lastDataRow = startR;

    for (let r = startR + 1; r < sheet.rowCount; r++) {
      const cell = sheet.data[cellPosToKey(r, adjCol)];
      if (cell && (cell.raw || (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== ''))) {
        lastDataRow = r;
      } else {
        break; // Stop at first empty cell in adjacent column
      }
    }

    if (lastDataRow > startR) {
      applyFillHandleDrag({
        startRow: selectedRange.startRow,
        startCol: selectedRange.startCol,
        endRow: lastDataRow,
        endCol: selectedRange.endCol,
      });
    }
  };

  const applyFillHandleDrag = (targetRange: CellRange) => {
    const updatedData = { ...sheet.data };
    const srcStartR = selectedRange.startRow;
    const srcEndR = selectedRange.endRow;
    const srcStartC = selectedRange.startCol;
    const srcEndC = selectedRange.endCol;
    const srcRowCount = srcEndR - srcStartR + 1;
    const srcColCount = srcEndC - srcStartC + 1;

    // 1. Dragging Downwards
    if (targetRange.endRow > srcEndR) {
      for (let c = srcStartC; c <= srcEndC; c++) {
        // Collect numeric series values if applicable
        const numSeries: number[] = [];
        for (let r = srcStartR; r <= srcEndR; r++) {
          const val = sheet.data[cellPosToKey(r, c)]?.value;
          const num = parseNumberSafely(val);
          if (num !== null) numSeries.push(num);
        }

        const isLinearSeries = numSeries.length >= 2;
        const step = isLinearSeries ? (numSeries[numSeries.length - 1] - numSeries[0]) / (numSeries.length - 1) : 1;

        for (let r = srcEndR + 1; r <= targetRange.endRow; r++) {
          const deltaR = r - srcEndR;
          const sourceRow = srcStartR + ((r - srcEndR - 1) % srcRowCount);
          const sourceKey = cellPosToKey(sourceRow, c);
          const sourceCell = sheet.data[sourceKey];

          if (sourceCell) {
            let newRaw = sourceCell.raw;
            let newVal = sourceCell.value;

            if (typeof newRaw === 'string' && newRaw.startsWith('=')) {
              const shiftR = r - sourceRow;
              newRaw = shiftFormula(newRaw, shiftR, 0);
              newVal = null;
            } else if (isLinearSeries && typeof sourceCell.value === 'number') {
              const nextVal = numSeries[numSeries.length - 1] + step * deltaR;
              newRaw = String(nextVal);
              newVal = nextVal;
            }

            updatedData[cellPosToKey(r, c)] = {
              raw: newRaw,
              value: newVal,
              format: sourceCell.format ? { ...sourceCell.format } : undefined,
            };
          }
        }
      }
    }
    // 2. Dragging to the Right
    else if (targetRange.endCol > srcEndC) {
      for (let r = srcStartR; r <= srcEndR; r++) {
        for (let c = srcEndC + 1; c <= targetRange.endCol; c++) {
          const sourceCol = srcStartC + ((c - srcEndC - 1) % srcColCount);
          const sourceKey = cellPosToKey(r, sourceCol);
          const sourceCell = sheet.data[sourceKey];

          if (sourceCell) {
            let newRaw = sourceCell.raw;
            let newVal = sourceCell.value;

            if (typeof newRaw === 'string' && newRaw.startsWith('=')) {
              const shiftC = c - sourceCol;
              newRaw = shiftFormula(newRaw, 0, shiftC);
              newVal = null;
            }

            updatedData[cellPosToKey(r, c)] = {
              raw: newRaw,
              value: newVal,
              format: sourceCell.format ? { ...sourceCell.format } : undefined,
            };
          }
        }
      }
    }

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
    onSelectRange(targetRange);
  };

  // Column Resizing handlers
  const handleMouseUp = () => {
    setIsSelecting(false);
    setIsCtrlSelecting(false);
    setIsRowSelecting(false);
    setRowSelectAnchor(null);
    setIsColSelecting(false);
    setColSelectAnchor(null);
    if (isDraggingFill && fillRange) {
      applyFillHandleDrag(fillRange);
      setIsDraggingFill(false);
      setFillRange(null);
    }
  };

  const handleColResizeMouseDown = (e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colIndex);
    setResizeStartX(e.clientX);
    setResizeStartWidth(sheet.colWidths[colIndex] || 110);
  };

  const handleColAutoFit = (colIndex: number) => {
    let maxChars = 8;
    for (let r = 0; r < Math.min(sheet.rowCount, 40); r++) {
      const val = getCellValue(sheet, r, colIndex);
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxChars) maxChars = len;
      }
    }
    const newWidth = Math.min(Math.max(maxChars * 9 + 30, 65), 400);
    onUpdateSheet({
      ...sheet,
      colWidths: { ...sheet.colWidths, [colIndex]: newWidth },
    });
  };

  // Row Resizing handlers
  const handleRowResizeMouseDown = (e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingRow(rowIndex);
    setResizeStartY(e.clientY);
    setResizeStartHeight(sheet.rowHeights[rowIndex] || 28);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol !== null) {
        const diff = e.clientX - resizeStartX;
        const newWidth = Math.max(45, resizeStartWidth + diff);
        onUpdateSheet({
          ...sheet,
          colWidths: { ...sheet.colWidths, [resizingCol]: newWidth },
        });
      }
      if (resizingRow !== null) {
        const diff = e.clientY - resizeStartY;
        const newHeight = Math.max(22, resizeStartHeight + diff);
        onUpdateSheet({
          ...sheet,
          rowHeights: { ...sheet.rowHeights, [resizingRow]: newHeight },
        });
      }
    };

    const handleGlobalMouseUp = () => {
      dragAnchorRef.current = null;
      if (resizingCol !== null) setResizingCol(null);
      if (resizingRow !== null) setResizingRow(null);
      setIsSelecting(false);
      setIsCtrlSelecting(false);
      setIsRowSelecting(false);
      setRowSelectAnchor(null);
      setIsColSelecting(false);
      setColSelectAnchor(null);
      if (isDraggingFill && fillRange) {
        applyFillHandleDrag(fillRange);
        setIsDraggingFill(false);
        setFillRange(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('pointerup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('pointerup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleGlobalMouseUp);
    };
  }, [resizingCol, resizingRow, resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight, isSelecting, isRowSelecting, isColSelecting, isDraggingFill, fillRange, sheet]);


  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      isOpen: true,
    });
  };

  // Column AutoFilter state
  const [openFilterCol, setOpenFilterCol] = useState<number | null>(null);

  // Apply Filter to a column
  const handleApplyColumnFilter = (colIndex: number, selectedValues: string[] | null) => {
    const updatedFilters = { ...(sheet.filters || {}) };
    if (selectedValues === null) {
      delete updatedFilters[colIndex];
    } else {
      updatedFilters[colIndex] = selectedValues;
    }
    onUpdateSheet({
      ...sheet,
      filters: updatedFilters,
      filterEnabled: true,
    });
  };

  // Sort rows based on column (preserving row 0 header)
  const handleSortColumn = (colIndex: number, direction: 'asc' | 'desc') => {
    // Collect all data rows
    const dataRowIndices: number[] = [];
    for (let r = 1; r < sheet.rowCount; r++) {
      dataRowIndices.push(r);
    }

    dataRowIndices.sort((a, b) => {
      const valA = getCellValue(sheet, a, colIndex);
      const valB = getCellValue(sheet, b, colIndex);

      const numA = parseNumberSafely(valA);
      const numB = parseNumberSafely(valB);

      if (numA !== null && numB !== null) {
        return direction === 'asc' ? numA - numB : numB - numA;
      }

      const strA = valA !== null && valA !== undefined ? String(valA).trim() : '';
      const strB = valB !== null && valB !== undefined ? String(valB).trim() : '';

      return direction === 'asc'
        ? strA.localeCompare(strB, undefined, { numeric: true })
        : strB.localeCompare(strA, undefined, { numeric: true });
    });

    // Reconstruct sheet.data with rows in sorted order
    const updatedData: { [key: string]: CellData } = {};
    // Copy row 0 unchanged
    for (let c = 0; c < sheet.colCount; c++) {
      const k0 = cellPosToKey(0, c);
      if (sheet.data[k0]) updatedData[k0] = sheet.data[k0];
    }

    // Map sorted data rows
    dataRowIndices.forEach((origRowIdx, targetIdx) => {
      const newRowIdx = targetIdx + 1;
      for (let c = 0; c < sheet.colCount; c++) {
        const srcKey = cellPosToKey(origRowIdx, c);
        const destKey = cellPosToKey(newRowIdx, c);
        if (sheet.data[srcKey]) {
          updatedData[destKey] = sheet.data[srcKey];
        }
      }
    });

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
  };

  // Filtered rows evaluation
  const visibleRowIndices = useMemo(() => {
    const indices: number[] = [0]; // Row 0 is always visible (header)
    const filters = sheet.filters || {};
    const activeFilterEntries = Object.entries(filters);

    for (let r = 1; r < sheet.rowCount; r++) {
      let isVisible = true;
      for (const [colStr, allowedValues] of activeFilterEntries) {
        const c = parseInt(colStr, 10);
        const cellVal = getCellValue(sheet, r, c);
        const strVal =
          cellVal !== null && cellVal !== undefined && cellVal !== ''
            ? String(cellVal).trim()
            : '(Vazio)';
        if (allowedValues && !allowedValues.includes(strVal)) {
          isVisible = false;
          break;
        }
      }
      if (isVisible) {
        indices.push(r);
      }
    }
    return indices;
  }, [sheet]);

  // Virtual Scrolling Windowing state
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(700);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  useEffect(() => {
    if (gridRef.current) {
      setViewportHeight(gridRef.current.clientHeight || 700);
    }
  }, []);

  const defaultRowHeight = 28;
  const bufferRows = 10;
  const totalVisibleCount = visibleRowIndices.length;
  const startVisibleIdx = Math.max(0, Math.floor(scrollTop / defaultRowHeight) - bufferRows);
  const visibleCount = Math.ceil(viewportHeight / defaultRowHeight) + bufferRows * 2;
  const endVisibleIdx = Math.min(totalVisibleCount - 1, startVisibleIdx + visibleCount);

  const topSpacerHeight = startVisibleIdx * defaultRowHeight;
  const bottomSpacerHeight = Math.max(0, (totalVisibleCount - 1 - endVisibleIdx) * defaultRowHeight);

  const renderedCols = sheet.colCount;
  // Memoize column numeric values for conditional formatting (Data Bars, Color Scales, Average)
  const columnValueMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (let c = 0; c < sheet.colCount; c++) {
      const vals: any[] = [];
      for (let r = 1; r < sheet.rowCount; r++) {
        const cell = sheet.data[cellPosToKey(r, c)];
        if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
          vals.push(cell.value);
        }
      }
      map[c] = vals;
    }
    return map;
  }, [sheet.data, sheet.rowCount, sheet.colCount]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
      <div
        ref={gridRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        className={`relative flex-1 overflow-auto bg-[#ffffff] select-none scrollbar-thin focus:outline-hidden ${
          !showGridlines ? 'no-gridlines' : ''
        }`}
        style={{ zoom: `${zoomLevel}%` }}
        tabIndex={0}
      >
      <table className={`border-collapse table-fixed w-max text-xs bg-white ${!showGridlines ? 'no-gridlines' : ''}`}>
        {/* Table Column Header: Top Left corner (#) + NocoDB Column Types */}
        <thead className="sticky top-0 z-20 bg-[#f8fafc]">
          <tr>
            {/* Top-left corner origin cell (#) */}
            <th
              title="Selecionar Toda a Tabela (Ctrl+A)"
              onClick={() => {
                setMultiSelectedKeys(new Set());
                setSelectionAnchor({ row: 0, col: 0 });
                onSelectCell({ row: 0, col: 0 });
                onSelectRange({
                  startRow: 0,
                  startCol: 0,
                  endRow: sheet.rowCount - 1,
                  endCol: sheet.colCount - 1,
                });
              }}
              className="sticky left-0 z-30 w-10 h-8 bg-[#f8fafc] border-r border-b border-[#e2e8f0] select-none cursor-pointer hover:bg-slate-100 transition-colors text-center text-slate-700 font-mono text-xs font-bold"
            >
              #
            </th>

            {Array.from({ length: renderedCols }).map((_, colIdx) => {
              const colLabel = colIndexToLabel(colIdx);
              const isColSelected =
                colIdx >= selectedRange.startCol && colIdx <= selectedRange.endCol;
              const isColActive = colIdx === activeCell.col;
              const width = sheet.colWidths[colIdx] || 120;
              const isColFiltered = Boolean(sheet.filters?.[colIdx]);
              const headerCell = sheet.data[cellPosToKey(0, colIdx)];
              const colHeaderTitle = headerCell?.value || colLabel;
              const colMeta = getNocoColumnIcon(sheet, colIdx);

              const hasCustomHeaderBg = Boolean(headerCell?.format?.bgColor);
              const headerBgColor = headerCell?.format?.bgColor;
              const headerTextColor = headerCell?.format?.textColor;

              return (
                <th
                  key={colIdx}
                  style={{
                    width: `${width}px`,
                    minWidth: `${width}px`,
                    maxWidth: `${width}px`,
                    backgroundColor: hasCustomHeaderBg ? headerBgColor : undefined,
                    color: hasCustomHeaderBg ? headerTextColor : undefined,
                  }}
                  className={`relative h-8 border-r border-b border-[#e2e8f0] text-xs font-sans font-semibold transition-colors cursor-pointer select-none group ${
                    hasCustomHeaderBg
                      ? 'shadow-xs font-bold'
                      : isColSelected || isColActive
                      ? 'bg-indigo-50 text-indigo-950 font-bold'
                      : 'bg-[#f8fafc] text-slate-800 hover:bg-slate-100'
                  }`}
                  onMouseDown={e => handleColHeaderMouseDown(e, colIdx)}
                  onMouseEnter={e => handleColHeaderMouseEnter(e, colIdx)}
                >
                  <div className="flex items-center justify-between px-2 font-sans relative w-full h-full">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-4 rounded flex items-center justify-center shrink-0 ${hasCustomHeaderBg ? 'bg-white/20 text-white backdrop-blur-xs' : colMeta.bg}`} title={`Tipo: ${colMeta.label}`}>
                        {colMeta.icon}
                      </span>
                      <span className={`truncate text-xs ${hasCustomHeaderBg ? 'text-white font-bold' : 'text-slate-800 font-bold group-hover:text-slate-950'}`}>
                        {headerCell?.value ? String(headerCell.value) : colLabel}
                      </span>
                    </div>

                    <ChevronDown className="size-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

                    {/* Filter Button */}
                    {sheet.filterEnabled && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setOpenFilterCol(openFilterCol === colIdx ? null : colIdx);
                        }}
                        title={`Filtrar / Classificar Coluna ${colLabel}`}
                        className={`absolute right-1 p-0.5 rounded transition-all cursor-pointer ${
                          isColFiltered
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-200'
                        }`}
                      >
                        <FilterIcon className="size-2.5" />
                      </button>
                    )}
                  </div>

                  {/* Column Filter Dropdown */}
                  {openFilterCol === colIdx && (
                    <ColumnFilterDropdown
                      colIndex={colIdx}
                      colName={String(colHeaderTitle)}
                      sheet={sheet}
                      selectedValues={sheet.filters?.[colIdx]}
                      isOpen={true}
                      onClose={() => setOpenFilterCol(null)}
                      onApplyFilter={handleApplyColumnFilter}
                      onSortColumn={handleSortColumn}
                    />
                  )}

                  {/* Column resize drag handle */}
                  <div
                    onMouseDown={e => handleColResizeMouseDown(e, colIdx)}
                    onDoubleClick={() => handleColAutoFit(colIdx)}
                    className="absolute right-0 top-0 bottom-0 w-2 hover:bg-indigo-500 cursor-col-resize z-20 group"
                  >
                    <div className="w-px h-full bg-[#e2e8f0] mx-auto group-hover:bg-indigo-500" />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Table Body with Top/Bottom virtual spacers */}
        <tbody>
          {topSpacerHeight > 0 && (
            <tr style={{ height: `${topSpacerHeight}px` }}>
              <td colSpan={renderedCols + 1} />
            </tr>
          )}

          {Array.from({ length: Math.max(0, endVisibleIdx - startVisibleIdx + 1) }).map((_, idx) => {
            const rowIdx = visibleRowIndices[startVisibleIdx + idx];
            if (rowIdx === undefined) return null;
            const isRowSelected =
              rowIdx >= selectedRange.startRow && rowIdx <= selectedRange.endRow;
            const isRowActive = rowIdx === activeCell.row;
            const height = sheet.rowHeights[rowIdx] || 26;

            return (
              <tr key={rowIdx} style={{ height: `${height}px` }}>
                {/* Sticky Row Number (Left column) - NocoDB # Column */}
                <th
                  className={`sticky left-0 z-10 w-10 border-r border-b border-[#e2e8f0] text-xs font-mono select-none transition-colors cursor-pointer text-center ${
                    isRowSelected || isRowActive
                      ? 'bg-indigo-50 text-indigo-950 font-bold border-r-2 border-r-indigo-600'
                      : 'bg-[#f8fafc] text-slate-700 font-bold hover:bg-slate-100'
                  }`}
                  onMouseDown={e => handleRowHeaderMouseDown(e, rowIdx)}
                  onMouseEnter={e => handleRowHeaderMouseEnter(e, rowIdx)}
                >
                  <div className="relative h-full flex items-center justify-center font-mono text-xs font-bold">
                    {rowIdx + 1}
                    <div
                      onMouseDown={e => handleRowResizeMouseDown(e, rowIdx)}
                      className="absolute bottom-0 left-0 right-0 h-1.5 hover:bg-indigo-500 cursor-row-resize z-20"
                    />
                  </div>
                </th>

                {/* Cells in row */}
                {Array.from({ length: renderedCols }).map((_, colIdx) => {

                  const key = cellPosToKey(rowIdx, colIdx);
                  const cell = sheet.data[key];

                  const isCellSelected =
                    activeCell.row === rowIdx && activeCell.col === colIdx;
                  const isCellInRange =
                    rowIdx >= selectedRange.startRow &&
                    rowIdx <= selectedRange.endRow &&
                    colIdx >= selectedRange.startCol &&
                    colIdx <= selectedRange.endCol;

                  const isCellEditing = isEditing && isCellSelected;

                  const merged = sheet.mergedRegions.find(
                    m => m.startRow === rowIdx && m.startCol === colIdx
                  );
                  const isCovered = sheet.mergedRegions.some(
                    m =>
                      rowIdx >= m.startRow &&
                      rowIdx <= m.endRow &&
                      colIdx >= m.startCol &&
                      colIdx <= m.endCol &&
                      !(m.startRow === rowIdx && m.startCol === colIdx)
                  );

                  const isSingleCell =
                    selectedRange.startRow === selectedRange.endRow &&
                    selectedRange.startCol === selectedRange.endCol;

                  // Check if this cell is part of any formula argument highlighted reference (Excel Arg Highlighting)
                  let cellFormulaHighlight: FormulaCellHighlightInfo | undefined = undefined;
                  if (formulaHighlights.length > 0) {
                    for (const fh of formulaHighlights) {
                      const { startRow, startCol, endRow, endCol } = fh.range;
                      if (rowIdx >= startRow && rowIdx <= endRow && colIdx >= startCol && colIdx <= endCol) {
                        cellFormulaHighlight = {
                          color: fh.color,
                          bgColor: fh.bgColor,
                          isTop: rowIdx === startRow,
                          isBottom: rowIdx === endRow,
                          isLeft: colIdx === startCol,
                          isRight: colIdx === endCol,
                        };
                        break;
                      }
                    }
                  }

                  return (
                    <GridCell
                      key={colIdx}
                      row={rowIdx}
                      col={colIdx}
                      cell={cell}
                      isSelected={isCellSelected}
                      isInRange={isCellInRange}
                      isMultiSelected={multiSelectedKeys.has(key)}
                      isSingleCellSelection={isSingleCell}
                      isRangeTop={isCellInRange && rowIdx === selectedRange.startRow}
                      isRangeBottom={isCellInRange && rowIdx === selectedRange.endRow}
                      isRangeLeft={isCellInRange && colIdx === selectedRange.startCol}
                      isRangeRight={isCellInRange && colIdx === selectedRange.endCol}
                      isRangeBottomRight={isCellInRange && rowIdx === selectedRange.endRow && colIdx === selectedRange.endCol}
                      formulaHighlight={cellFormulaHighlight}
                      isEditing={isCellEditing}
                      editValue={editValue}
                      mergedRegion={merged}
                      isMergeCovered={isCovered}
                      conditionalRules={sheet.conditionalRules}
                      allColumnValues={columnValueMap[colIdx] || []}


                      onMouseDown={handleCellMouseDown}
                      onMouseEnter={handleCellMouseEnter}
                      onDoubleClick={() => startEditing()}
                      onEditChange={setEditValue}
                      onEditKeyDown={e => {
                        if (e.key === 'Enter') {
                          commitEdit();
                          onSelectCell({ row: rowIdx + 1, col: colIdx });
                          onSelectRange({
                            startRow: rowIdx + 1,
                            startCol: colIdx,
                            endRow: rowIdx + 1,
                            endCol: colIdx,
                          });
                        } else if (e.key === 'Escape') {
                          setIsEditing(false);
                        } else if (e.key === 'Tab') {
                          commitEdit();
                          onSelectCell({ row: rowIdx, col: colIdx + 1 });
                          onSelectRange({
                            startRow: rowIdx,
                            startCol: colIdx + 1,
                            endRow: rowIdx,
                            endCol: colIdx + 1,
                          });
                        }
                      }}
                      onEditBlur={commitEdit}
                      onFillMouseDown={handleFillMouseDown}
                      onFillDoubleClick={handleFillDoubleClick}
                    />
                  );
                })}
              </tr>
            );
          })}

          {bottomSpacerHeight > 0 && (
            <tr style={{ height: `${bottomSpacerHeight}px` }}>
              <td colSpan={renderedCols + 1} />
            </tr>
          )}
        </tbody>
      </table>


      {/* Floating Quick Analysis Lens Trigger (CTRL+Q Button) */}
      {hasMultipleSelection && (
        <div className="fixed bottom-14 right-8 z-30 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {multiSelectedKeys.size > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white font-bold text-xs shadow-xl border border-slate-700 animate-in zoom-in-95">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{multiSelectedKeys.size} células selecionadas (CTRL)</span>
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


      {/* Flash Fill Smart Hint Toast */}
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
              onClick={() => handleApplyFlashFill(flashFillHint)}
              className="ml-2 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              Preencher {flashFillHint.predictedValues.length} linhas
            </button>
          </div>
        </div>
      )}

      {/* Context Menu (Right Click with smart viewport boundary positioning) */}
      {contextMenu?.isOpen && (() => {
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
            onClick={() => setContextMenu(null)}
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
      })()}
      </div>

      {/* NocoDB Bottom Status & Summary Bar */}
      <div className="h-8 shrink-0 bg-[#f8fafc] border-t border-[#e2e8f0] px-3 flex items-center justify-between text-xs text-slate-600 select-none z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1 font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-200/60 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            <Plus className="size-3.5 text-slate-500" />
            <span>Novo Registro</span>
          </button>

          <span className="text-slate-300">|</span>

          <span className="text-slate-500 font-sans">
            {Math.max(sheet.rowCount - 1, 0)} registros
          </span>

          <span className="text-slate-300">|</span>

          <button
            onClick={onToggleSummary || onOpenQuickAnalysis}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 px-1.5 py-0.5 rounded hover:bg-slate-200/50 cursor-pointer"
          >
            <ChevronDown className="size-3 text-slate-400" />
            <span>Resumo</span>
          </button>
        </div>

        {/* NocoAI Floating Button on Bottom Right */}
        {onToggleCopilot && (
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleCopilot}
              aria-label="Abrir assistente NocoAI"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-900 text-violet-200 border border-violet-500/40 font-bold text-xs shadow-lg backdrop-blur-xs hover:shadow-violet-500/20 hover:scale-105 btn-tactile cursor-pointer"
            >
              <Sparkles className="size-3.5 text-violet-400 animate-pulse" />
              <span>NocoAI</span>
            </button>
          </div>
        )}
      </div>

      {/* Double ESC Active Filter Cleared Notification Toast */}
      {filterClearedToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-900/95 px-4 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <FilterX className="size-4 text-emerald-400" />
          <span>Filtros eliminados com sucesso</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 border border-slate-700">
            ESC 2x
          </span>
        </div>
      )}
    </div>
  );
};
