import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Sheet, CellPosition, CellRange, ConditionalFormatRule } from './types/spreadsheet';
import {
  createSalesSampleSheet,
  createEmptySheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
  createAgentPauseSampleSheet,
} from './data/sampleDatasets';
import {
  recalculateSheet,
  colIndexToLabel,
  cellPosToKey,
  getCellValue,
  parseNumberSafely,
} from './engine/formulaParser';

// Components
import { RibbonBar } from './components/Header/RibbonBar';
import { FormulaBar } from './components/Header/FormulaBar';
import { SpreadsheetGrid } from './components/Grid/SpreadsheetGrid';
import { SheetTabs } from './components/Grid/SheetTabs';
import { PowerQueryEditor } from './components/PowerQuery/PowerQueryEditor';
import { DashboardStudio } from './components/PowerBI/DashboardStudio';
import { CopilotPanel } from './components/Copilot/CopilotPanel';
import { applyAgentActions } from './engine/agentActionExecutor';
import { AgentAction } from './engine/agentActionProtocol';
import { NocoIconRail, NocoNavView } from './components/NocoLayout/NocoIconRail';
import { NocoBaseSidebar } from './components/NocoLayout/NocoBaseSidebar';
import { NocoTopHeader } from './components/NocoLayout/NocoTopHeader';
import { NocoTableToolbar } from './components/NocoLayout/NocoTableToolbar';
import { exportSheetToExcel } from './utils/excelExporter';

// Modals
import { QuickAnalysisModal } from './components/Modals/QuickAnalysisModal';
import { FormulaWizardModal, FormulaInsertOptions } from './components/Modals/FormulaWizardModal';
import { TextToColumnsModal } from './components/Modals/TextToColumnsModal';
import { ConditionalFormatModal } from './components/Modals/ConditionalFormatModal';
import { ImportExportModal } from './components/Modals/ImportExportModal';
import { ShortcutsModal } from './components/Modals/ShortcutsModal';
import { FindReplaceModal } from './components/Modals/FindReplaceModal';
import { GeminiApiKeyModal } from './components/Modals/GeminiApiKeyModal';
import { autoRecognizeAndFormatSheet } from './utils/dataRecognizer';

// NocoDB Advanced Modals & Drawers
import { NocoShareModal } from './components/NocoLayout/NocoShareModal';
import { NocoFieldsModal } from './components/NocoLayout/NocoFieldsModal';
import { NocoSortModal } from './components/NocoLayout/NocoSortModal';
import { NocoSummaryDrawer } from './components/NocoLayout/NocoSummaryDrawer';
import { NocoUserProfileModal } from './components/NocoLayout/NocoUserProfileModal';
import { NocoHistoryDrawer } from './components/NocoLayout/NocoHistoryDrawer';
import { NocoFormatModal } from './components/NocoLayout/NocoFormatModal';
import { RelationsCanvas } from './components/Relations/RelationsCanvas';
import {
  loadInitialSheetsSync,
  loadSheetsFromStorageAsync,
  saveSheetsToStorage,
  saveActiveSheetId,
  loadActiveSheetId,
  saveStarredSheets,
  loadStarredSheets,
  saveUserPreferences,
  loadUserPreferences,
} from './utils/storageManager';

export function App() {
  const initialPrefs = useMemo(() => loadUserPreferences(), []);
  const initialSheets = useMemo(() => loadInitialSheetsSync(), []);

  // Initialize with persisted sheets or domain dataset
  const [sheets, setSheets] = useState<Sheet[]>(initialSheets);
  const [activeSheetId, setActiveSheetId] = useState<string>(() => loadActiveSheetId(initialSheets));
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 0, col: 0 });
  const [selectedRange, setSelectedRange] = useState<CellRange>({
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
  });

  // History stack for Undo / Redo
  const [historyPast, setHistoryPast] = useState<Sheet[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<Sheet[][]>([]);

  // Navigation View: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations'
  const [activeView, setActiveView] = useState<'spreadsheet' | 'powerquery' | 'powerbi' | 'relations'>('spreadsheet');
  const [activeNav, setActiveNav] = useState<NocoNavView>('data');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(initialPrefs.isSidebarOpen ?? true);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // View settings
  const [showGridlines, setShowGridlines] = useState(initialPrefs.showGridlines ?? true);
  const [showFormulaBar, setShowFormulaBar] = useState(initialPrefs.showFormulaBar ?? true);
  const [zoomLevel, setZoomLevel] = useState(initialPrefs.zoomLevel ?? 100);

  // Copilot AI state
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  // Modals state
  const [isQuickAnalysisOpen, setIsQuickAnalysisOpen] = useState(false);
  const [isFormulaWizardOpen, setIsFormulaWizardOpen] = useState(false);
  const [isTextToColumnsOpen, setIsTextToColumnsOpen] = useState(false);
  const [isConditionalModalOpen, setIsConditionalModalOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);

  // NocoDB Specific Dialog States
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
  const [starredSheetIds, setStarredSheetIds] = useState<Set<string>>(() => loadStarredSheets());

  // Asynchronous IndexedDB re-hydration on mount
  useEffect(() => {
    let isMounted = true;
    loadSheetsFromStorageAsync().then(storedSheets => {
      if (isMounted && storedSheets && storedSheets.length > 0) {
        setSheets(storedSheets);
        setActiveSheetId(prev => {
          if (storedSheets.some(s => s.id === prev)) return prev;
          return loadActiveSheetId(storedSheets);
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-Save Sheets to Persistent Storage
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSheetsToStorage(sheets);
    }, 200);
    return () => clearTimeout(timer);
  }, [sheets]);

  // Persist Active Sheet ID
  useEffect(() => {
    if (activeSheetId) {
      saveActiveSheetId(activeSheetId);
    }
  }, [activeSheetId]);

  // Persist Starred Sheets
  useEffect(() => {
    saveStarredSheets(starredSheetIds);
  }, [starredSheetIds]);

  // Persist User Preferences
  useEffect(() => {
    saveUserPreferences({
      showGridlines,
      showFormulaBar,
      zoomLevel,
      isSidebarOpen,
    });
  }, [showGridlines, showFormulaBar, zoomLevel, isSidebarOpen]);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // Helper to record history before making mutations
  const pushHistory = useCallback((currentSheets: Sheet[]) => {
    setHistoryPast(prev => [...prev.slice(-25), currentSheets]);
    setHistoryFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast(prev => prev.slice(0, prev.length - 1));
    setHistoryFuture(prev => [sheets, ...prev]);
    setSheets(previous);
  }, [historyPast, sheets]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture(prev => prev.slice(1));
    setHistoryPast(prev => [...prev, sheets]);
    setSheets(next);
  }, [historyFuture, sheets]);

  // Update active sheet and recalculate all sheets with full workbook context
  const handleUpdateSheet = useCallback((updatedSheet: Sheet) => {
    pushHistory(sheets);
    setSheets(prev => {
      const nextSheets = prev.map(s => (s.id === updatedSheet.id ? updatedSheet : s));
      return nextSheets.map(s => recalculateSheet(s, nextSheets));
    });
  }, [sheets, pushHistory]);

  // Auto recognize types and format active sheet cleanly
  const handleAutoRecognize = useCallback(() => {
    pushHistory(sheets);
    const { sheet: recognizedSheet } = autoRecognizeAndFormatSheet(activeSheet);
    setSheets(prev => prev.map(s => (s.id === recognizedSheet.id ? recognizedSheet : s)));
  }, [activeSheet, sheets, pushHistory]);

  // Commit formula from FormulaBar
  const handleCommitFormula = useCallback((formula: string) => {
    pushHistory(sheets);
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const updatedData = { ...activeSheet.data };
    const prevCell = activeSheet.data[key];

    updatedData[key] = {
      raw: formula,
      value: formula.startsWith('=') ? null : formula,
      format: prevCell?.format,
    };

    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
  }, [activeCell, activeSheet, handleUpdateSheet, pushHistory, sheets]);

  // Insert formula from Wizard with flexible destination support
  const handleInsertFormula = useCallback((options: FormulaInsertOptions | string) => {
    pushHistory(sheets);
    const formulaStr = typeof options === 'string' ? options : options.formula;
    const targetMode = typeof options === 'string' ? 'active_cell' : options.targetMode;
    const customCell = typeof options === 'string' ? undefined : options.customCell;

    const updatedData = { ...activeSheet.data };

    if (targetMode === 'active_cell') {
      const key = cellPosToKey(activeCell.row, activeCell.col);
      updatedData[key] = {
        raw: formulaStr,
        value: formulaStr.startsWith('=') ? null : formulaStr,
        format: activeSheet.data[key]?.format,
      };
    } else if (targetMode === 'first_empty_col') {
      // Find first empty column
      let targetCol = activeSheet.colCount;
      for (let c = 0; c < activeSheet.colCount; c++) {
        let hasData = false;
        for (let r = 0; r < Math.min(activeSheet.rowCount, 50); r++) {
          const val = activeSheet.data[`${r}_${c}`]?.value;
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            hasData = true;
            break;
          }
        }
        if (!hasData) {
          targetCol = c;
          break;
        }
      }

      // Fill whole selection range height
      const startR = selectedRange.startRow;
      const endR = selectedRange.endRow;
      for (let r = startR; r <= endR; r++) {
        const delta = r - startR;
        const adjusted = formulaStr.replace(/(?<!\$)([A-Za-z]+)(?<!\$)(\d+)/g, (match, colLetters, rowNumber) => {
          return `${colLetters}${parseInt(rowNumber, 10) + delta}`;
        });
        const key = cellPosToKey(r, targetCol);
        updatedData[key] = {
          raw: adjusted,
          value: adjusted.startsWith('=') ? null : adjusted,
          format: activeSheet.data[key]?.format,
        };
      }
    } else if (targetMode === 'below_selection') {
      const targetRow = selectedRange.endRow + 1;
      const targetCol = selectedRange.startCol;
      const key = cellPosToKey(targetRow, targetCol);
      updatedData[key] = {
        raw: formulaStr,
        value: formulaStr.startsWith('=') ? null : formulaStr,
        format: activeSheet.data[key]?.format,
      };
    } else if (targetMode === 'fill_column') {
      // Fill down in adjacent column or first empty column
      const targetCol = selectedRange.endCol + 1 < activeSheet.colCount ? selectedRange.endCol + 1 : selectedRange.startCol;
      const startR = selectedRange.startRow;
      const endR = selectedRange.endRow;
      for (let r = startR; r <= endR; r++) {
        const delta = r - startR;
        const adjusted = formulaStr.replace(/(?<!\$)([A-Za-z]+)(?<!\$)(\d+)/g, (match, colLetters, rowNumber) => {
          return `${colLetters}${parseInt(rowNumber, 10) + delta}`;
        });
        const key = cellPosToKey(r, targetCol);
        updatedData[key] = {
          raw: adjusted,
          value: adjusted.startsWith('=') ? null : adjusted,
          format: activeSheet.data[key]?.format,
        };
      }
    } else if (targetMode === 'custom' && customCell) {
      const match = customCell.match(/^([A-Za-z]+)(\d+)$/);
      if (match) {
        const colLetters = match[1].toUpperCase();
        let c = 0;
        for (let i = 0; i < colLetters.length; i++) {
          c = c * 26 + (colLetters.charCodeAt(i) - 64);
        }
        c = c - 1;
        const r = parseInt(match[2], 10) - 1;
        if (r >= 0 && c >= 0) {
          const key = cellPosToKey(r, c);
          updatedData[key] = {
            raw: formulaStr,
            value: formulaStr.startsWith('=') ? null : formulaStr,
            format: activeSheet.data[key]?.format,
          };
        }
      }
    }

    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
    setIsFormulaWizardOpen(false);
  }, [activeCell, activeSheet, handleUpdateSheet, pushHistory, selectedRange, sheets]);

  // Insert formula template
  const handleInsertFormulaTemplate = useCallback((template: string) => {
    pushHistory(sheets);
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const updatedData = {
      ...activeSheet.data,
      [key]: {
        raw: template,
        value: template.startsWith('=') ? null : template,
        format: activeSheet.data[key]?.format,
      },
    };
    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
  }, [activeCell, activeSheet, handleUpdateSheet, pushHistory, sheets]);

  // Quick Analysis: Insert totals / calculations
  const handleInsertTotals = (
    type: 'SUM' | 'AVG' | 'COUNT' | 'PERCENT' | 'SUMPRODUCT' | 'WEIGHTED_AVG',
    direction: 'row' | 'col'
  ) => {
    pushHistory(sheets);
    const updatedData = { ...activeSheet.data };

    if (direction === 'col') {
      // Below each column
      const targetRow = selectedRange.endRow + 1;
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        const startAddr = `${colIndexToLabel(c)}${selectedRange.startRow + 1}`;
        const endAddr = `${colIndexToLabel(c)}${selectedRange.endRow + 1}`;
        const destKey = cellPosToKey(targetRow, c);

        let formula = '';
        if (type === 'SUM') formula = `=SOMA(${startAddr}:${endAddr})`;
        else if (type === 'AVG') formula = `=MÉDIA(${startAddr}:${endAddr})`;
        else if (type === 'COUNT') formula = `=CONT.VALORES(${startAddr}:${endAddr})`;
        else if (type === 'PERCENT') formula = `=${startAddr}/SOMA(${startAddr}:${endAddr})`;
        else if (type === 'SUMPRODUCT' && c + 1 <= selectedRange.endCol) {
          const secondColStart = `${colIndexToLabel(c + 1)}${selectedRange.startRow + 1}`;
          const secondColEnd = `${colIndexToLabel(c + 1)}${selectedRange.endRow + 1}`;
          formula = `=SOMARPRODUTO(${startAddr}:${endAddr}, ${secondColStart}:${secondColEnd})`;
        } else if (type === 'WEIGHTED_AVG' && c + 1 <= selectedRange.endCol) {
          const secondColStart = `${colIndexToLabel(c + 1)}${selectedRange.startRow + 1}`;
          const secondColEnd = `${colIndexToLabel(c + 1)}${selectedRange.endRow + 1}`;
          formula = `=MÉDIA.PONDERADA(${startAddr}:${endAddr}, ${secondColStart}:${secondColEnd})`;
        } else {
          formula = `=SOMA(${startAddr}:${endAddr})`;
        }

        updatedData[destKey] = {
          raw: formula,
          value: null,
          format: {
            bold: true,
            bgColor: '#f0fdf4',
            textColor: '#15803d',
            align: 'right',
          },
        };
      }
    } else {
      // Right of each row
      const targetCol = selectedRange.endCol + 1;
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        const startAddr = `${colIndexToLabel(selectedRange.startCol)}${r + 1}`;
        const endAddr = `${colIndexToLabel(selectedRange.endCol)}${r + 1}`;
        const destKey = cellPosToKey(r, targetCol);

        updatedData[destKey] = {
          raw: `=SOMA(${startAddr}:${endAddr})`,
          value: null,
          format: {
            bold: true,
            bgColor: '#f0fdf4',
            textColor: '#15803d',
            align: 'right',
          },
        };
      }
    }

    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
    setIsQuickAnalysisOpen(false);
  };

  // Delimiter Split (Text to Columns)
  const handleApplySplit = (delimiter: string, customChar?: string) => {
    pushHistory(sheets);
    const effectiveDelim = delimiter === 'custom' ? (customChar || ';') : delimiter;
    const targetCol = selectedRange.startCol;
    const updatedData = { ...activeSheet.data };

    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      const srcKey = cellPosToKey(r, targetCol);
      const cell = updatedData[srcKey];
      if (cell && cell.raw) {
        let parts: string[] = [];
        if (delimiter === 'space') {
          parts = String(cell.raw).split(/\s+/);
        } else {
          parts = String(cell.raw).split(effectiveDelim);
        }

        parts.forEach((part, colOffset) => {
          const destKey = cellPosToKey(r, targetCol + colOffset);
          const num = parseNumberSafely(part.trim());
          updatedData[destKey] = {
            raw: part.trim(),
            value: num !== null ? num : part.trim(),
            format: { ...cell.format },
          };
        });
      }
    }

    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
    setIsTextToColumnsOpen(false);
  };

  // Add conditional formatting rule
  const handleAddConditionalRule = useCallback((rule: ConditionalFormatRule) => {
    pushHistory(sheets);
    const updatedRules = [...activeSheet.conditionalRules, rule];
    const updatedSheet: Sheet = {
      ...activeSheet,
      conditionalRules: updatedRules,
    };
    handleUpdateSheet(updatedSheet);
    setIsConditionalModalOpen(false);
  }, [activeSheet, handleUpdateSheet, pushHistory, sheets]);

  // Add / Duplicate / Delete / Rename Sheet
  const handleAddSheet = () => {
    pushHistory(sheets);
    const newIdx = sheets.length + 1;
    const emptySheet = createEmptySheet(`sheet-${Date.now()}`, `Planilha ${newIdx}`, 100, 26);
    setSheets(prev => [...prev, emptySheet]);
    setActiveSheetId(emptySheet.id);
  };


  const handleDuplicateSheet = (id: string) => {
    const target = sheets.find(s => s.id === id);
    if (!target) return;
    pushHistory(sheets);
    const dupSheet: Sheet = {
      ...target,
      id: `sheet-${Date.now()}`,
      name: `${target.name} (Cópia)`,
    };
    setSheets(prev => [...prev, dupSheet]);
    setActiveSheetId(dupSheet.id);
  };

  const handleDeleteSheet = (id: string) => {
    if (sheets.length <= 1) return;
    pushHistory(sheets);
    const remaining = sheets.filter(s => s.id !== id);
    setSheets(remaining);
    if (activeSheetId === id) {
      setActiveSheetId(remaining[0].id);
    }
  };

  const handleRenameSheet = (id: string, newName: string) => {
    pushHistory(sheets);
    setSheets(prev => prev.map(s => (s.id === id ? { ...s, name: newName } : s)));
  };

  const handleInsertFormulaFromCopilot = (formula: string) => {
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const updatedData = {
      ...activeSheet.data,
      [key]: {
        ...activeSheet.data[key],
        raw: formula,
        value: null,
      },
    };
    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
  };

  const handleExecuteAgentActions = useCallback((actions: AgentAction[]) => {
    pushHistory(sheets);
    const result = applyAgentActions(sheets, activeSheetId, actions);
    setSheets(result.updatedSheets);
    if (result.newActiveSheetId !== activeSheetId) {
      setActiveSheetId(result.newActiveSheetId);
    }
  }, [sheets, activeSheetId, pushHistory]);

  const handleCreateNewSheetFromData = useCallback((name: string, columns: string[], rows: any[]) => {
    pushHistory(sheets);
    const newSheetId = `sheet-${Date.now()}`;
    const newSheet = createEmptySheet(newSheetId, name, Math.max(100, rows.length + 20), Math.max(26, columns.length + 5));
    const newData: { [key: string]: any } = {};

    // Cabeçalhos na linha 0
    columns.forEach((col, idx) => {
      const key = cellPosToKey(0, idx);
      newData[key] = {
        raw: String(col),
        value: String(col),
        format: { bold: true, bgColor: '#1e293b', textColor: '#ffffff', align: 'center' },
      };
    });

    // Linhas
    rows.forEach((row, rIdx) => {
      const r = rIdx + 1;
      columns.forEach((col, cIdx) => {
        const val = row[col];
        const key = cellPosToKey(r, cIdx);
        newData[key] = {
          raw: val === null || val === undefined ? '' : String(val),
          value: val,
        };
      });
    });

    newSheet.data = newData;
    const recalculated = recalculateSheet(newSheet, sheets);
    setSheets(prev => [...prev, recalculated]);
    setActiveSheetId(newSheetId);
  }, [sheets, pushHistory]);

  const handleNewBlankWorkbook = () => {
    pushHistory(sheets);
    const blank = createEmptySheet(`sheet-${Date.now()}`, 'Planilha1', 100, 26);
    setSheets([blank]);
    setActiveSheetId(blank.id);
    setActiveCell({ row: 0, col: 0 });
    setSelectedRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  };

  const handleLoadSampleSales = () => {
    pushHistory(sheets);
    const sales = recalculateSheet(createSalesSampleSheet());
    setSheets(prev => [sales, ...prev.filter(s => s.id !== sales.id)]);
    setActiveSheetId(sales.id);
    setActiveCell({ row: 8, col: 6 });
    setSelectedRange({ startRow: 8, startCol: 6, endRow: 8, endCol: 6 });
  };

  const handleLoadSampleHR = () => {
    pushHistory(sheets);
    const hr = recalculateSheet(createHRStaffSampleSheet());
    setSheets(prev => [...prev.filter(s => s.id !== hr.id), hr]);
    setActiveSheetId(hr.id);
    setActiveCell({ row: 1, col: 1 });
    setSelectedRange({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 });
  };

  const handleLoadSampleBudget = () => {
    pushHistory(sheets);
    const fin = recalculateSheet(createFinancialBudgetSheet());
    setSheets(prev => [...prev.filter(s => s.id !== fin.id), fin]);
    setActiveSheetId(fin.id);
    setActiveCell({ row: 1, col: 1 });
    setSelectedRange({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 });
  };

  return (
    <div className="flex h-screen w-screen bg-[#f8fafc] text-slate-900 overflow-hidden font-sans select-none">
      {/* 1. Leftmost NocoDB Icon Rail */}
      <NocoIconRail
        activeNav={activeNav}
        onSelectNav={nav => {
          setActiveNav(nav);
          if (nav === 'data') setActiveView('spreadsheet');
          if (nav === 'workflows') setActiveView('powerquery');
          if (nav === 'interfaces') setActiveView('powerbi');
          if (nav === 'settings') setIsApiKeyModalOpen(true);
          if (nav === 'help') setIsShortcutsOpen(true);
        }}
        onNewSheet={handleAddSheet}
        onToggleCopilot={() => setIsCopilotOpen(prev => !prev)}
        isCopilotOpen={isCopilotOpen}
        onOpenUserProfile={() => setIsUserProfileOpen(true)}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        onToggleFavorites={() => {
          setStarredSheetIds(prev => {
            const next = new Set(prev);
            if (next.has(activeSheetId)) next.delete(activeSheetId);
            else next.add(activeSheetId);
            return next;
          });
        }}
        isStarred={starredSheetIds.has(activeSheetId)}
      />

      {/* 2. Collapsible Base & Tables Sidebar Drawer */}
      <NocoBaseSidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(prev => !prev)}
        sheets={sheets}
        activeSheetId={activeSheetId}
        onSelectSheet={setActiveSheetId}
        onNewSheet={handleAddSheet}
        onDeleteSheet={handleDeleteSheet}
        activeView={activeView}
        onSelectView={setActiveView}
      />

      {/* 3. Main Center Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Top Header Breadcrumb & Global Actions */}
        <NocoTopHeader
          sheet={activeSheet}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          activeView={activeView}
          onSelectView={setActiveView}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyPast.length > 0}
          canRedo={historyFuture.length > 0}
          onRefresh={() => {
            const recalculated = recalculateSheet(activeSheet);
            handleUpdateSheet(recalculated);
          }}
          onExportExcel={() => exportSheetToExcel(sheets.length > 1 ? sheets : activeSheet, activeSheet.name)}
          onOpenImportModal={() => setIsImportExportOpen(true)}
          onToggleCopilot={() => setIsCopilotOpen(prev => !prev)}
          onOpenShare={() => setIsShareModalOpen(true)}
          onRenameSheet={newName => handleRenameSheet(activeSheetId, newName)}
        />

        {/* DATA TABLE SPREADSHEET VIEW */}
        {activeView === 'spreadsheet' && (
          <>
            {/* NocoDB Data Table Toolbar */}
            <NocoTableToolbar
              sheet={activeSheet}
              onOpenFormulaWizard={() => setIsFormulaWizardOpen(true)}
              onOpenQuickAnalysis={() => setIsQuickAnalysisOpen(true)}
              onOpenConditionalFormat={() => setIsConditionalModalOpen(true)}
              onOpenFindReplace={() => setIsFindReplaceOpen(true)}
              onAutoRecognize={() => {
                const { sheet: recognized } = autoRecognizeAndFormatSheet(activeSheet);
                handleUpdateSheet(recalculateSheet(recognized));
              }}
              onNewRecord={() => {
                const updated = {
                  ...activeSheet,
                  rowCount: activeSheet.rowCount + 1,
                };
                handleUpdateSheet(updated);
              }}
              searchFilter={searchFilter}
              onSearchChange={setSearchFilter}
              recordCount={activeSheet.rowCount}
              onOpenFields={() => setIsFieldsModalOpen(true)}
              onOpenSort={() => setIsSortModalOpen(true)}
              onOpenFormat={() => setIsFormatModalOpen(true)}
            />

            {/* Formula Bar */}
            {showFormulaBar && (
              <FormulaBar
                sheet={activeSheet}
                activeCell={activeCell}
                selectedRange={selectedRange}
                onCommitFormula={handleCommitFormula}
                onOpenFormulaWizard={() => setIsFormulaWizardOpen(true)}
                onSelectCell={setActiveCell}
                onSelectRange={setSelectedRange}
              />
            )}

            {/* Main Spreadsheet Grid + Inline Copilot Layout */}
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
              <SpreadsheetGrid
                sheet={activeSheet}
                allSheets={sheets}
                activeCell={activeCell}
                selectedRange={selectedRange}
                showGridlines={showGridlines}
                zoomLevel={zoomLevel}
                onUpdateSheet={handleUpdateSheet}
                onSelectCell={setActiveCell}
                onSelectRange={setSelectedRange}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onOpenQuickAnalysis={() => setIsQuickAnalysisOpen(true)}
                onOpenFormulaWizard={() => setIsFormulaWizardOpen(true)}
                onOpenTextToColumns={() => setIsTextToColumnsOpen(true)}
                onOpenConditionalModal={() => setIsConditionalModalOpen(true)}
                onOpenCharts={() => setActiveView('powerbi')}
                onOpenFindReplace={() => setIsFindReplaceOpen(true)}
                onExecuteAgentActions={handleExecuteAgentActions}
                onLoadTemplate={newSheet => {
                  pushHistory(sheets);
                  const recalculated = recalculateSheet(newSheet);
                  setSheets(prev => prev.map(s => s.id === activeSheetId ? recalculated : s));
                }}
                onOpenImportModal={() => setIsImportExportOpen(true)}
                onToggleCopilot={() => setIsCopilotOpen(prev => !prev)}
                onToggleSummary={() => setIsSummaryDrawerOpen(prev => !prev)}
                onOpenFormatModal={() => setIsFormatModalOpen(true)}
                searchFilter={searchFilter}
                onClearSearchFilter={() => setSearchFilter('')}
              />

              <CopilotPanel
                isOpen={isCopilotOpen}
                onClose={() => setIsCopilotOpen(false)}
                sheet={activeSheet}
                activeCell={activeCell}
                onInsertFormula={handleInsertFormulaFromCopilot}
                onOpenSettings={() => setIsApiKeyModalOpen(true)}
                onOpenPowerBI={() => setActiveView('powerbi')}
                onExecuteAgentActions={handleExecuteAgentActions}
                onCreateNewSheet={handleCreateNewSheetFromData}
              />
            </div>
          </>
        )}

        {/* POWER QUERY STUDIO VIEW */}
        {activeView === 'powerquery' && (
          <PowerQueryEditor
            sheet={activeSheet}
            allSheets={sheets}
            onApplyChangesToSheet={handleUpdateSheet}
            onClose={() => setActiveView('spreadsheet')}
          />
        )}

        {/* POWER BI VISUAL ANALYTICS VIEW */}
        {activeView === 'powerbi' && (
          <DashboardStudio
            sheet={activeSheet}
            onClose={() => setActiveView('spreadsheet')}
            onLoadSampleSales={handleLoadSampleSales}
          />
        )}

        {/* RELATIONS CANVAS & NODE-GRAPH PIPELINE VIEW */}
        {activeView === 'relations' && (
          <RelationsCanvas
            sheets={sheets}
            activeSheet={activeSheet}
            onUpdateSheets={newSheets => {
              pushHistory(sheets);
              setSheets(newSheets);
            }}
            onNavigateView={setActiveView}
            onOpenShare={() => setIsShareModalOpen(true)}
            onOpenCopilot={() => setIsCopilotOpen(true)}
            onOpenImportModal={() => setIsImportExportOpen(true)}
          />
        )}
      </div>

      {/* MODALS & DRAWERS */}
      <NocoFormatModal
        isOpen={isFormatModalOpen}
        onClose={() => setIsFormatModalOpen(false)}
        sheet={activeSheet}
        selectedRange={selectedRange}
        onUpdateSheet={handleUpdateSheet}
      />

      <NocoShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        sheet={activeSheet}
      />

      <NocoFieldsModal
        isOpen={isFieldsModalOpen}
        onClose={() => setIsFieldsModalOpen(false)}
        sheet={activeSheet}
        onUpdateSheet={handleUpdateSheet}
      />

      <NocoSortModal
        isOpen={isSortModalOpen}
        onClose={() => setIsSortModalOpen(false)}
        sheet={activeSheet}
        onUpdateSheet={handleUpdateSheet}
      />

      <NocoSummaryDrawer
        isOpen={isSummaryDrawerOpen}
        onClose={() => setIsSummaryDrawerOpen(false)}
        sheet={activeSheet}
        selectedRange={selectedRange}
      />

      <NocoUserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        onOpenSettings={() => setIsApiKeyModalOpen(true)}
        tableCount={sheets.length}
      />

      <NocoHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        historyPastCount={historyPast.length}
        historyFutureCount={historyFuture.length}
        onUndo={handleUndo}
        onRedo={handleRedo}
        sheetName={activeSheet.name || 'Tabela'}
      />

      <QuickAnalysisModal
        isOpen={isQuickAnalysisOpen}
        onClose={() => setIsQuickAnalysisOpen(false)}
        selectedRange={selectedRange}
        sheet={activeSheet}
        onApplyConditionalRule={handleAddConditionalRule}
        onInsertTotals={handleInsertTotals}
        onOpenChart={() => {
          setActiveView('powerbi');
        }}
        onOpenPivot={() => {
          setActiveView('powerbi');
        }}
      />

      <FormulaWizardModal
        isOpen={isFormulaWizardOpen}
        onClose={() => setIsFormulaWizardOpen(false)}
        sheet={activeSheet}
        allSheets={sheets}
        activeCell={activeCell}
        selectedRange={selectedRange}
        onInsertFormula={handleInsertFormula}
      />

      <TextToColumnsModal
        isOpen={isTextToColumnsOpen}
        onClose={() => setIsTextToColumnsOpen(false)}
        selectedRange={selectedRange}
        sheet={activeSheet}
        onApplySplit={handleApplySplit}
      />

      <ConditionalFormatModal
        isOpen={isConditionalModalOpen}
        onClose={() => setIsConditionalModalOpen(false)}
        selectedRange={selectedRange}
        onAddRule={handleAddConditionalRule}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        sheets={sheets}
        activeSheetId={activeSheetId}
        onLoadSheet={newSheet => {
          pushHistory(sheets);
          const { sheet: recognizedSheet } = autoRecognizeAndFormatSheet(newSheet);
          const recalculated = recalculateSheet(recognizedSheet);
          setSheets([recalculated]);
          setActiveSheetId(recalculated.id);
        }}
      />

      <FindReplaceModal
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        sheet={activeSheet}
        activeCell={activeCell}
        onSelectCell={setActiveCell}
        onUpdateSheet={handleUpdateSheet}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <GeminiApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />
    </div>
  );
}


export default App;
