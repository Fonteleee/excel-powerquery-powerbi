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
import { computeSmartSeries } from '../../engine/autoFillEngine';
import { getNocoColumnIcon } from './columnMeta';
import { useGridClipboard } from './hooks/useGridClipboard';
import { useGridKeyboard } from './hooks/useGridKeyboard';
import { computeFilledData } from './fillOps';
import { deleteRowsData, sortRowsData } from './gridOps';
import { GridBodyRows } from './GridBodyRows';
import { GridHeaderRow } from './GridHeaderRow';
import { SheetChartsLayer } from '../../features/charts/SheetChartsLayer';
import { SheetImagesLayer } from '../../features/charts/SheetImagesLayer';
import { GridContextMenu } from './GridContextMenu';
import { GridOverlays } from './GridOverlays';
import { GridStatusBar } from './GridStatusBar';
import { exportSheetToExcel } from '../../utils/excelExporter';


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

  const { clipboard, setClipboard, handleCopySelection, handlePasteSelection } = useGridClipboard({
    sheet,
    activeCell,
    selectedRange,
    onUpdateSheet,
  });


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

  // Excluir as linhas selecionadas por completo
  const handleDeleteSelectedRows = () => {
    const rStart = selectedRange.startRow;
    const { data, rowCount: newRowCount } = deleteRowsData(sheet, rStart, selectedRange.endRow);
    const recalculated = recalculateSheet({ ...sheet, data, rowCount: newRowCount });
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
    const recalculated = recalculateSheet({ ...sheet, data: computeFilledData(sheet, selectedRange, targetRange) });
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

  // Ordena as linhas pela coluna (a linha 0 é o cabeçalho)
  const handleSortColumn = (colIndex: number, direction: 'asc' | 'desc') => {
    onUpdateSheet(recalculateSheet({ ...sheet, data: sortRowsData(sheet, colIndex, direction) }));
  };


  // Filtered rows evaluation
  const visibleRowIndices = useMemo(() => {
    const indices: number[] = [0]; // Row 0 is always visible (header)
    const filters = sheet.filters || {};
    const activeFilterEntries = Object.entries(filters);

    const hiddenRows = new Set(sheet.hiddenRows);
    for (let r = 1; r < sheet.rowCount; r++) {
      if (hiddenRows.has(r)) continue;
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

  useGridKeyboard({
    sheet, activeCell, selectedRange, selectionAnchor, isEditing, clipboard, multiSelectedKeys, flashFillHint,
    lastEscTimeRef, onUpdateSheet, onSelectCell, onSelectRange, onUndo, onRedo, onOpenQuickAnalysis,
    onOpenFindReplace, onClearSearchFilter, setClipboard, setOpenFilterCol, setMultiSelectedKeys, setContextMenu,
    setFlashFillHint, setSelectionAnchor, setFilterClearedToast, handleCopySelection, handlePasteSelection,
    handleToggleFormat, handleApplyFlashFill, handleDeleteSelectedRows, startEditing, clearSelectedCells,
  });

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
        <GridHeaderRow
          sheet={sheet}
          activeCell={activeCell}
          selectedRange={selectedRange}
          renderedCols={renderedCols}
          openFilterCol={openFilterCol}
          setOpenFilterCol={setOpenFilterCol}
          onSelectAll={() => {
            setMultiSelectedKeys(new Set());
            setSelectionAnchor({ row: 0, col: 0 });
            onSelectCell({ row: 0, col: 0 });
            onSelectRange({ startRow: 0, startCol: 0, endRow: sheet.rowCount - 1, endCol: sheet.colCount - 1 });
          }}
          handleColHeaderMouseDown={handleColHeaderMouseDown}
          handleColHeaderMouseEnter={handleColHeaderMouseEnter}
          handleColResizeMouseDown={handleColResizeMouseDown}
          handleColAutoFit={handleColAutoFit}
          handleApplyColumnFilter={handleApplyColumnFilter}
          handleSortColumn={handleSortColumn}
        />

        {/* Table Body with Top/Bottom virtual spacers */}
        <tbody>
          {topSpacerHeight > 0 && (
            <tr style={{ height: `${topSpacerHeight}px` }}>
              <td colSpan={renderedCols + 1} />
            </tr>
          )}

          <GridBodyRows
            sheet={sheet}
            activeCell={activeCell}
            selectedRange={selectedRange}
            renderedCols={renderedCols}
            rowIndices={visibleRowIndices.slice(startVisibleIdx, endVisibleIdx + 1)}
            isEditing={isEditing}
            editValue={editValue}
            multiSelectedKeys={multiSelectedKeys}
            formulaHighlights={formulaHighlights}
            columnValueMap={columnValueMap}
            setEditValue={setEditValue}
            startEditing={startEditing}
            commitEdit={commitEdit}
            setIsEditing={setIsEditing}
            onSelectCell={onSelectCell}
            onSelectRange={onSelectRange}
            handleRowHeaderMouseDown={handleRowHeaderMouseDown}
            handleRowHeaderMouseEnter={handleRowHeaderMouseEnter}
            handleRowResizeMouseDown={handleRowResizeMouseDown}
            handleCellMouseDown={handleCellMouseDown}
            handleCellMouseEnter={handleCellMouseEnter}
            handleFillMouseDown={handleFillMouseDown}
            handleFillDoubleClick={handleFillDoubleClick}
          />

          {bottomSpacerHeight > 0 && (
            <tr style={{ height: `${bottomSpacerHeight}px` }}>
              <td colSpan={renderedCols + 1} />
            </tr>
          )}
        </tbody>
      </table>
      <SheetChartsLayer sheet={sheet} onUpdateSheet={onUpdateSheet} />
      <SheetImagesLayer sheet={sheet} />


      <GridOverlays
        sheet={sheet}
        hasMultipleSelection={hasMultipleSelection}
        multiSelectedCount={multiSelectedKeys.size}
        flashFillHint={flashFillHint}
        onOpenQuickAnalysis={onOpenQuickAnalysis}
        onApplyFlashFill={handleApplyFlashFill}
      />


      {contextMenu?.isOpen && (
        <GridContextMenu
          contextMenu={contextMenu}
          sheet={sheet}
          activeCell={activeCell}
          onClose={() => setContextMenu(null)}
          handleCopySelection={handleCopySelection}
          handlePasteSelection={handlePasteSelection}
          handleApplyFlashFill={handleApplyFlashFill}
          handleDeleteSelectedRows={handleDeleteSelectedRows}
          clearSelectedCells={clearSelectedCells}
          onOpenFormatModal={onOpenFormatModal}
          onOpenQuickAnalysis={onOpenQuickAnalysis}
          onOpenTextToColumns={onOpenTextToColumns}
          onOpenConditionalModal={onOpenConditionalModal}
        />
      )}

      </div>

      <GridStatusBar
        recordCount={Math.max(sheet.rowCount - 1, 0)}
        onAddRow={handleAddRow}
        onSummary={onToggleSummary || onOpenQuickAnalysis}
        onToggleCopilot={onToggleCopilot}
      />


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
