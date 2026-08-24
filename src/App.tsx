import React, { useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Sheet, CellPosition, CellRange, ConditionalFormatRule } from './types/spreadsheet';
import {
  createSalesSampleSheet,
  createEmptySheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
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

// Modals
import { QuickAnalysisModal } from './components/Modals/QuickAnalysisModal';
import { FormulaWizardModal } from './components/Modals/FormulaWizardModal';
import { TextToColumnsModal } from './components/Modals/TextToColumnsModal';
import { ConditionalFormatModal } from './components/Modals/ConditionalFormatModal';
import { ImportExportModal } from './components/Modals/ImportExportModal';
import { ShortcutsModal } from './components/Modals/ShortcutsModal';
import { FindReplaceModal } from './components/Modals/FindReplaceModal';
import { GeminiApiKeyModal } from './components/Modals/GeminiApiKeyModal';
import { AutoFormatNotificationToast } from './components/Common/AutoFormatNotificationToast';
import { autoRecognizeAndFormatSheet, DataRecognitionReport } from './utils/dataRecognizer';

export function App() {

  // Initialize with the rich Sales Sample Sheet calculated
  const [sheets, setSheets] = useState<Sheet[]>(() => {
    const sales = recalculateSheet(createSalesSampleSheet());
    const hr = recalculateSheet(createHRStaffSampleSheet());
    const fin = recalculateSheet(createFinancialBudgetSheet());
    return [sales, hr, fin];
  });

  const [activeSheetId, setActiveSheetId] = useState<string>(() => sheets[0]?.id || 'sheet-sales');
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 8, col: 6 });
  const [selectedRange, setSelectedRange] = useState<CellRange>({
    startRow: 8,
    startCol: 6,
    endRow: 8,
    endCol: 6,
  });

  // History stack for Undo / Redo
  const [historyPast, setHistoryPast] = useState<Sheet[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<Sheet[][]>([]);

  // Navigation View: 'spreadsheet' | 'powerquery' | 'powerbi'
  const [activeView, setActiveView] = useState<'spreadsheet' | 'powerquery' | 'powerbi'>('spreadsheet');

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
  const [recognitionReport, setRecognitionReport] = useState<DataRecognitionReport | null>(null);


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

  // Update active sheet
  const handleUpdateSheet = useCallback((updatedSheet: Sheet) => {
    pushHistory(sheets);
    setSheets(prev => prev.map(s => (s.id === updatedSheet.id ? updatedSheet : s)));
  }, [sheets, pushHistory]);

  // Auto recognize types and format active sheet
  const handleAutoRecognize = useCallback(() => {
    pushHistory(sheets);
    const { sheet: recognizedSheet, report } = autoRecognizeAndFormatSheet(activeSheet);
    setSheets(prev => prev.map(s => (s.id === recognizedSheet.id ? recognizedSheet : s)));
    setRecognitionReport(report);
    if (report.columnsFormatted.length > 0) {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    }
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

  // Insert formula from Wizard
  const handleInsertFormula = useCallback((formula: string) => {
    pushHistory(sheets);
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const updatedData = {
      ...activeSheet.data,
      [key]: {
        raw: formula,
        value: formula.startsWith('=') ? null : formula,
        format: activeSheet.data[key]?.format,
      },
    };
    const recalculated = recalculateSheet({ ...activeSheet, data: updatedData });
    handleUpdateSheet(recalculated);
    setIsFormulaWizardOpen(false);
  }, [activeCell, activeSheet, handleUpdateSheet, pushHistory, sheets]);

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
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f5f5f5] text-[#242424] overflow-hidden font-sans">
      {/* SPREADSHEET MAIN WORKSPACE */}
      {activeView === 'spreadsheet' && (
        <>
          {/* Top Application Ribbon */}
          <RibbonBar
            sheet={activeSheet}
            selectedRange={selectedRange}
            activeView={activeView}
            onSetActiveView={setActiveView}
            onUpdateSheet={handleUpdateSheet}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyPast.length > 0}
            canRedo={historyFuture.length > 0}
            onOpenQuickAnalysis={() => setIsQuickAnalysisOpen(true)}
            onOpenFormulaWizard={() => setIsFormulaWizardOpen(true)}
            onOpenTextToColumns={() => setIsTextToColumnsOpen(true)}
            onOpenConditionalModal={() => setIsConditionalModalOpen(true)}
            onOpenImportExport={() => setIsImportExportOpen(true)}
            onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
            onOpenFindReplace={() => setIsFindReplaceOpen(true)}
            onInsertFormulaTemplate={handleInsertFormulaTemplate}
            isCopilotOpen={isCopilotOpen}
            onToggleCopilot={() => setIsCopilotOpen(prev => !prev)}
          />

          {/* Formula Bar */}
          <FormulaBar
            sheet={activeSheet}
            activeCell={activeCell}
            selectedRange={selectedRange}
            onCommitFormula={handleCommitFormula}
            onOpenFormulaWizard={() => setIsFormulaWizardOpen(true)}
          />

          {/* Grid + Copilot Container */}
          <div className="flex-1 flex overflow-hidden relative">
            <SpreadsheetGrid
              sheet={activeSheet}
              activeCell={activeCell}
              selectedRange={selectedRange}
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
            />

            <CopilotPanel
              isOpen={isCopilotOpen}
              onClose={() => setIsCopilotOpen(false)}
              sheet={activeSheet}
              activeCell={activeCell}
              onInsertFormula={handleInsertFormulaFromCopilot}
              onOpenSettings={() => setIsApiKeyModalOpen(true)}
            />
          </div>

          {/* Bottom Tabs Bar */}
          <SheetTabs
            sheets={sheets}
            activeSheetId={activeSheetId}
            selectedRange={selectedRange}
            onSelectSheet={setActiveSheetId}
            onAddSheet={handleAddSheet}
            onRenameSheet={handleRenameSheet}
            onDuplicateSheet={handleDuplicateSheet}
            onDeleteSheet={handleDeleteSheet}
          />
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
        />
      )}

      {/* MODALS */}
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
          const { sheet: recognizedSheet, report } = autoRecognizeAndFormatSheet(newSheet);
          const recalculated = recalculateSheet(recognizedSheet);
          setSheets([recalculated]);
          setActiveSheetId(recalculated.id);
          setRecognitionReport(report);
          confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
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

      <AutoFormatNotificationToast
        report={recognitionReport}
        onClose={() => setRecognitionReport(null)}
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
