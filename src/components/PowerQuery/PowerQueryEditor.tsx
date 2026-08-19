import React, { useState, useMemo } from 'react';
import {
  Database,
  CheckCircle2,
  Trash2,
  Split,
  Sparkles,
  Layers,
  Type,
  Plus,
  Copy,
  Table,
  Sliders,
  Clock,
  DollarSign,
  Hash,
  Percent,
  Calendar,
  Filter,
  ArrowRight,
  ArrowDown,
  FileSpreadsheet,
  Download,
  X,
  PlusCircle,
  HelpCircle,
  Scissors,
  Check,
  Zap,
} from 'lucide-react';
import { Sheet, CellFormat } from '../../types/spreadsheet';
import { QueryStep, ColumnProfile, QueryStepType } from '../../types/powerquery';
import { profileSheetColumns } from '../../engine/dataProfiler';
import {
  colIndexToLabel,
  getCellValue,
  recalculateSheet,
  cellPosToKey,
  formatCellValue,
  parseNumberSafely,
  valueToSeconds,
} from '../../engine/formulaParser';
import { exportSheetToExcel } from '../../utils/excelExporter';
import { MergeQueriesModal } from '../Modals/MergeQueriesModal';
import { MergeQueriesResult } from '../../engine/mergeQueriesEngine';

interface PowerQueryEditorProps {
  sheet: Sheet;
  allSheets?: Sheet[];
  onApplyChangesToSheet: (updatedSheet: Sheet) => void;
  onClose: () => void;
}

export const PowerQueryEditor: React.FC<PowerQueryEditorProps> = ({
  sheet,
  allSheets = [sheet],
  onApplyChangesToSheet,
  onClose,
}) => {
  // Current working sheet data
  const [workingSheet, setWorkingSheet] = useState<Sheet>(sheet);
  const [isMergeQueriesOpen, setIsMergeQueriesOpen] = useState(false);


  // Applied Steps Pipeline
  const [steps, setSteps] = useState<QueryStep[]>([
    {
      id: 'step-source',
      name: 'Fonte de Dados',
      type: 'source',
      description: `Carregado ${sheet.name} (${sheet.rowCount - 1} linhas)`,
      params: { sheetSnapshot: JSON.parse(JSON.stringify(sheet)) },
      timestamp: Date.now(),
    },
    {
      id: 'step-headers',
      name: 'Cabeçalhos Promovidos',
      type: 'change_type',
      description: 'Primeira linha usada como cabeçalho de coluna',
      params: { sheetSnapshot: JSON.parse(JSON.stringify(sheet)) },
      timestamp: Date.now() + 1,
    },
  ]);

  const [activeTab, setActiveTab] = useState<'home' | 'transform' | 'add_column' | 'view'>('home');
  const [selectedColIndex, setSelectedColIndex] = useState<number>(0);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'merge_columns' | 'custom_column' | 'conditional_column' | 'replace_values' | 'split_column' | null
  >(null);

  // Merge Columns Modal State
  const [mergeSelectedCols, setMergeSelectedCols] = useState<number[]>([0, 1]);
  const [mergeSeparator, setMergeSeparator] = useState<'space' | 'hyphen' | 'comma' | 'semicolon' | 'slash' | 'none' | 'custom'>('hyphen');
  const [mergeCustomSep, setMergeCustomSep] = useState(' - ');
  const [mergeNewColName, setMergeNewColName] = useState('Colunas_Mescladas');
  const [mergeReplaceOriginal, setMergeReplaceOriginal] = useState(false);

  // Custom Column Modal State
  const [customColName, setCustomColName] = useState('Personalizada');
  const [customColFormula, setCustomColFormula] = useState('');

  // Conditional Column Modal State
  const [condColName, setCondColName] = useState('Condicional');
  const [condTargetCol, setCondTargetCol] = useState(0);
  const [condOperator, setCondOperator] = useState<'equals' | 'contains' | 'greater' | 'less' | 'not_empty'>('equals');
  const [condCompareVal, setCondCompareVal] = useState('');
  const [condOutputVal, setCondOutputVal] = useState('');
  const [condElseVal, setCondElseVal] = useState('Outro');

  // Replace Values Modal State
  const [replaceOldVal, setReplaceOldVal] = useState('');
  const [replaceNewVal, setReplaceNewVal] = useState('');

  // Split Column Modal State
  const [splitChar, setSplitChar] = useState(';');

  // Profile columns
  const columnProfiles = useMemo(() => {
    return profileSheetColumns(workingSheet, 0);
  }, [workingSheet]);

  const activeProfile = columnProfiles[selectedColIndex] || columnProfiles[0];

  // Helper to record step & commit snapshot
  const commitStep = (
    stepName: string,
    stepType: QueryStepType,
    description: string,
    newSheet: Sheet,
    params: Record<string, any> = {}
  ) => {
    const newStep: QueryStep = {
      id: `step-${Date.now()}`,
      name: stepName,
      type: stepType,
      description,
      params: { ...params, sheetSnapshot: JSON.parse(JSON.stringify(newSheet)) },
      timestamp: Date.now(),
    };

    setSteps(prev => [...prev, newStep]);
    setWorkingSheet(newSheet);
  };

  // Revert/Delete a step from the pipeline
  const handleDeleteStep = (stepId: string) => {
    if (stepId === 'step-source') return; // Cannot delete source
    const remainingSteps = steps.filter(s => s.id !== stepId);
    setSteps(remainingSteps);

    // Restore snapshot from the latest remaining step
    const lastStep = remainingSteps[remainingSteps.length - 1];
    if (lastStep && lastStep.params?.sheetSnapshot) {
      setWorkingSheet(lastStep.params.sheetSnapshot);
    }
  };

  // 1. DETECT DATA TYPES AUTOMATICALLY (Reconhecimento Automático de Tipos)
  const handleDetectDataTypes = () => {
    const updatedData = { ...workingSheet.data };
    let detectedCount = 0;

    columnProfiles.forEach(cp => {
      const type = cp.inferredType;
      for (let r = 1; r < workingSheet.rowCount; r++) {
        const key = cellPosToKey(r, cp.colIndex);
        const cell = updatedData[key];
        if (cell && cell.raw !== '') {
          const strVal = String(cell.value ?? cell.raw).trim();
          const format: CellFormat = { ...cell.format };

          if (type === 'time') {
            format.type = 'time_hh_mm_ss';
            format.align = 'center';
            detectedCount++;
          } else if (type === 'currency') {
            format.type = 'currency';
            format.decimals = 2;
            format.align = 'right';
            const n = parseNumberSafely(strVal);
            if (n !== null) cell.value = n;
            detectedCount++;
          } else if (type === 'percentage') {
            format.type = 'percentage';
            format.decimals = 1;
            format.align = 'right';
            const n = parseNumberSafely(strVal);
            if (n !== null) cell.value = n;
            detectedCount++;
          } else if (type === 'number') {
            format.type = 'number';
            format.decimals = strVal.includes('.') || strVal.includes(',') ? 2 : 0;
            format.align = 'right';
            const n = parseNumberSafely(strVal);
            if (n !== null) cell.value = n;
            detectedCount++;
          } else if (type === 'date') {
            format.type = 'date';
            format.align = 'center';
            detectedCount++;
          }

          updatedData[key] = { ...cell, format };
        }
      }
    });

    const newSheet = recalculateSheet({ ...workingSheet, data: updatedData });
    commitStep(
      'Tipo de Dados Detectado Automaticamente',
      'detect_data_types',
      `Identificado ${columnProfiles.length} colunas (Tempo, Moeda, Número, Data, Texto)`,
      newSheet
    );
  };

  // 2. MERGE COLUMNS (Mesclar Colunas)
  const handleApplyMergeColumns = () => {
    if (mergeSelectedCols.length < 2) return;

    let sep = ' ';
    if (mergeSeparator === 'hyphen') sep = ' - ';
    else if (mergeSeparator === 'comma') sep = ', ';
    else if (mergeSeparator === 'semicolon') sep = '; ';
    else if (mergeSeparator === 'slash') sep = ' / ';
    else if (mergeSeparator === 'none') sep = '';
    else if (mergeSeparator === 'custom') sep = mergeCustomSep;

    const updatedData = { ...workingSheet.data };
    const newColIndex = workingSheet.colCount;

    // Header for merged column
    const headerKey = cellPosToKey(0, newColIndex);
    updatedData[headerKey] = {
      raw: mergeNewColName,
      value: mergeNewColName,
      format: { bold: true, bgColor: '#107c41', textColor: '#ffffff', align: 'left' },
    };

    // Rows
    for (let r = 1; r < workingSheet.rowCount; r++) {
      const parts = mergeSelectedCols.map(c => {
        const val = getCellValue(workingSheet, r, c);
        return val !== null && val !== undefined ? String(val).trim() : '';
      });
      const mergedVal = parts.filter(p => p !== '').join(sep);
      const destKey = cellPosToKey(r, newColIndex);
      updatedData[destKey] = {
        raw: mergedVal,
        value: mergedVal,
        format: { align: 'left' },
      };
    }

    const mergedColNames = mergeSelectedCols.map(c => columnProfiles[c]?.colName || `Col ${colIndexToLabel(c)}`).join(' + ');
    const newSheet = recalculateSheet({
      ...workingSheet,
      colCount: workingSheet.colCount + 1,
      data: updatedData,
    });

    commitStep(
      `Colunas Mescladas (${mergeNewColName})`,
      'merge_columns',
      `Unido [${mergedColNames}] com separador "${sep}" na nova coluna "${mergeNewColName}"`,
      newSheet
    );
    setActiveModal(null);
  };

  // 3. ADD CUSTOM COLUMN (Adicionar Coluna Personalizada)
  const handleApplyCustomColumn = () => {
    if (!customColName.trim()) return;

    const updatedData = { ...workingSheet.data };
    const newColIndex = workingSheet.colCount;

    // Header
    updatedData[cellPosToKey(0, newColIndex)] = {
      raw: customColName,
      value: customColName,
      format: { bold: true, bgColor: '#107c41', textColor: '#ffffff', align: 'left' },
    };

    // Rows
    for (let r = 1; r < workingSheet.rowCount; r++) {
      let formulaExpr = customColFormula;
      // Replace [ColumnName] with actual row cell value or address
      columnProfiles.forEach(cp => {
        const cellVal = getCellValue(workingSheet, r, cp.colIndex);
        const cellStr = cellVal !== null && cellVal !== undefined ? String(cellVal) : '';
        const numVal = parseNumberSafely(cellVal);
        const replacement = numVal !== null ? String(numVal) : `"${cellStr}"`;
        formulaExpr = formulaExpr.split(`[${cp.colName}]`).join(replacement);
      });

      let calculatedResult: any = formulaExpr;
      try {
        if (/^[\d\s+\-*/.()]+$/.test(formulaExpr)) {
          // eslint-disable-next-line no-eval
          calculatedResult = Function(`"use strict"; return (${formulaExpr})`)();
        }
      } catch (err) {
        calculatedResult = formulaExpr;
      }

      updatedData[cellPosToKey(r, newColIndex)] = {
        raw: String(calculatedResult),
        value: calculatedResult,
        format: { align: typeof calculatedResult === 'number' ? 'right' : 'left' },
      };
    }

    const newSheet = recalculateSheet({
      ...workingSheet,
      colCount: workingSheet.colCount + 1,
      data: updatedData,
    });

    commitStep(
      `Coluna Personalizada (${customColName})`,
      'add_custom_column',
      `Criada coluna "${customColName}" com expressão "${customColFormula}"`,
      newSheet
    );
    setActiveModal(null);
    setCustomColFormula('');
  };

  // 4. ADD CONDITIONAL COLUMN (Adicionar Coluna Condicional)
  const handleApplyConditionalColumn = () => {
    if (!condColName.trim()) return;

    const updatedData = { ...workingSheet.data };
    const newColIndex = workingSheet.colCount;

    // Header
    updatedData[cellPosToKey(0, newColIndex)] = {
      raw: condColName,
      value: condColName,
      format: { bold: true, bgColor: '#107c41', textColor: '#ffffff', align: 'left' },
    };

    // Rows
    for (let r = 1; r < workingSheet.rowCount; r++) {
      const sourceVal = getCellValue(workingSheet, r, condTargetCol);
      const strVal = sourceVal !== null && sourceVal !== undefined ? String(sourceVal).trim() : '';
      const numVal = parseNumberSafely(sourceVal);
      const compareNum = parseNumberSafely(condCompareVal);

      let matched = false;
      if (condOperator === 'equals') {
        matched = strVal.toLowerCase() === condCompareVal.toLowerCase();
      } else if (condOperator === 'contains') {
        matched = strVal.toLowerCase().includes(condCompareVal.toLowerCase());
      } else if (condOperator === 'greater' && numVal !== null && compareNum !== null) {
        matched = numVal > compareNum;
      } else if (condOperator === 'less' && numVal !== null && compareNum !== null) {
        matched = numVal < compareNum;
      } else if (condOperator === 'not_empty') {
        matched = strVal !== '';
      }

      const finalVal = matched ? condOutputVal : condElseVal;
      updatedData[cellPosToKey(r, newColIndex)] = {
        raw: finalVal,
        value: finalVal,
        format: { align: 'left' },
      };
    }

    const newSheet = recalculateSheet({
      ...workingSheet,
      colCount: workingSheet.colCount + 1,
      data: updatedData,
    });

    const targetColName = columnProfiles[condTargetCol]?.colName || `Col ${colIndexToLabel(condTargetCol)}`;
    commitStep(
      `Coluna Condicional (${condColName})`,
      'add_conditional_column',
      `Se [${targetColName}] ${condOperator} "${condCompareVal}" então "${condOutputVal}" senão "${condElseVal}"`,
      newSheet
    );
    setActiveModal(null);
  };

  // 5. ADD INDEX COLUMN (Adicionar Coluna de Índice 1, 2, 3...)
  const handleAddIndexColumn = (startFrom = 1) => {
    const updatedData = { ...workingSheet.data };
    const newColIndex = workingSheet.colCount;

    updatedData[cellPosToKey(0, newColIndex)] = {
      raw: 'Índice',
      value: 'Índice',
      format: { bold: true, bgColor: '#107c41', textColor: '#ffffff', align: 'center' },
    };

    for (let r = 1; r < workingSheet.rowCount; r++) {
      const idxVal = (r - 1) + startFrom;
      updatedData[cellPosToKey(r, newColIndex)] = {
        raw: String(idxVal),
        value: idxVal,
        format: { align: 'center', type: 'number', decimals: 0 },
      };
    }

    const newSheet = recalculateSheet({
      ...workingSheet,
      colCount: workingSheet.colCount + 1,
      data: updatedData,
    });

    commitStep(
      'Coluna de Índice Adicionada',
      'add_index_column',
      `Adicionado índice sequencial iniciando em ${startFrom}`,
      newSheet
    );
  };

  // 6. DUPLICATE COLUMN (Duplicar Coluna)
  const handleDuplicateColumn = () => {
    const sourceCol = selectedColIndex;
    const sourceProfile = columnProfiles[sourceCol];
    const newColIndex = workingSheet.colCount;
    const newColName = `${sourceProfile?.colName || 'Coluna'} - Cópia`;

    const updatedData = { ...workingSheet.data };
    updatedData[cellPosToKey(0, newColIndex)] = {
      raw: newColName,
      value: newColName,
      format: { bold: true, bgColor: '#107c41', textColor: '#ffffff', align: 'left' },
    };

    for (let r = 1; r < workingSheet.rowCount; r++) {
      const sourceCell = workingSheet.data[cellPosToKey(r, sourceCol)];
      if (sourceCell) {
        updatedData[cellPosToKey(r, newColIndex)] = {
          raw: sourceCell.raw,
          value: sourceCell.value,
          format: sourceCell.format,
        };
      }
    }

    const newSheet = recalculateSheet({
      ...workingSheet,
      colCount: workingSheet.colCount + 1,
      data: updatedData,
    });

    commitStep(
      `Coluna Duplicada (${newColName})`,
      'duplicate_column',
      `Criada cópia da coluna "${sourceProfile?.colName}"`,
      newSheet
    );
  };

  // 7. TEXT TRANSFORMATIONS (Uppercase, Lowercase, Propercase, Trim)
  const handleTextTransform = (transformType: 'uppercase' | 'lowercase' | 'propercase' | 'trim') => {
    const targetCol = selectedColIndex;
    const targetName = columnProfiles[targetCol]?.colName || `Col ${colIndexToLabel(targetCol)}`;
    const updatedData = { ...workingSheet.data };

    for (let r = 1; r < workingSheet.rowCount; r++) {
      const key = cellPosToKey(r, targetCol);
      const cell = updatedData[key];
      if (cell && cell.raw) {
        const rawStr = String(cell.value ?? cell.raw);
        let transformed = rawStr;
        if (transformType === 'uppercase') transformed = rawStr.toUpperCase();
        else if (transformType === 'lowercase') transformed = rawStr.toLowerCase();
        else if (transformType === 'propercase') transformed = rawStr.replace(/\b\w/g, c => c.toUpperCase());
        else if (transformType === 'trim') transformed = rawStr.trim().replace(/\s+/g, ' ');

        updatedData[key] = { ...cell, raw: transformed, value: transformed };
      }
    }

    const newSheet = recalculateSheet({ ...workingSheet, data: updatedData });
    const labelMap = {
      uppercase: 'Texto em MAIÚSCULAS',
      lowercase: 'Texto em minúsculas',
      propercase: 'Primeira Letra Maiúscula',
      trim: 'Limpar Espaços Excedentes (Trim)',
    };

    commitStep(
      labelMap[transformType],
      transformType,
      `Aplicado ${labelMap[transformType]} na coluna "${targetName}"`,
      newSheet
    );
  };

  // 8. REPLACE VALUES
  const handleApplyReplaceValues = () => {
    const targetCol = selectedColIndex;
    const targetName = columnProfiles[targetCol]?.colName || `Col ${colIndexToLabel(targetCol)}`;
    const updatedData = { ...workingSheet.data };

    for (let r = 1; r < workingSheet.rowCount; r++) {
      const key = cellPosToKey(r, targetCol);
      const cell = updatedData[key];
      if (cell && cell.raw) {
        const rawStr = String(cell.value ?? cell.raw);
        if (rawStr === replaceOldVal || rawStr.includes(replaceOldVal)) {
          const replaced = rawStr.split(replaceOldVal).join(replaceNewVal);
          updatedData[key] = { ...cell, raw: replaced, value: replaced };
        }
      }
    }

    const newSheet = recalculateSheet({ ...workingSheet, data: updatedData });
    commitStep(
      `Valor Substituído (${replaceOldVal} ➔ ${replaceNewVal})`,
      'replace_value',
      `Substituído "${replaceOldVal}" por "${replaceNewVal}" na coluna "${targetName}"`,
      newSheet
    );
    setActiveModal(null);
    setReplaceOldVal('');
    setReplaceNewVal('');
  };

  // 9. REMOVE NULL / EMPTY ROWS
  const handleRemoveNullRows = () => {
    const targetCol = selectedColIndex;
    const targetName = columnProfiles[targetCol]?.colName || `Col ${colIndexToLabel(targetCol)}`;
    const remainingRowsData: any[][] = [];

    // Header row
    const headerRow: any[] = [];
    for (let c = 0; c < workingSheet.colCount; c++) {
      headerRow.push(getCellValue(workingSheet, 0, c));
    }
    remainingRowsData.push(headerRow);

    // Filter rows where targetCol is not empty
    for (let r = 1; r < workingSheet.rowCount; r++) {
      const val = getCellValue(workingSheet, r, targetCol);
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        const rowVals: any[] = [];
        for (let c = 0; c < workingSheet.colCount; c++) {
          rowVals.push(getCellValue(workingSheet, r, c));
        }
        remainingRowsData.push(rowVals);
      }
    }

    const updatedData: Record<string, any> = {};
    remainingRowsData.forEach((rowVals, rIdx) => {
      rowVals.forEach((val, cIdx) => {
        const origCell = workingSheet.data[cellPosToKey(rIdx, cIdx)];
        updatedData[cellPosToKey(rIdx, cIdx)] = {
          raw: String(val ?? ''),
          value: val,
          format: origCell?.format,
        };
      });
    });

    const newSheet = recalculateSheet({
      ...workingSheet,
      rowCount: remainingRowsData.length,
      data: updatedData,
    });

    commitStep(
      'Linhas Nulas Removidas',
      'remove_nulls',
      `Removidas linhas vazias baseadas na coluna "${targetName}" (${workingSheet.rowCount - remainingRowsData.length} linhas eliminadas)`,
      newSheet
    );
  };

  // 10. REMOVE DUPLICATE ROWS
  const handleRemoveDuplicates = () => {
    const targetCol = selectedColIndex;
    const targetName = columnProfiles[targetCol]?.colName || `Col ${colIndexToLabel(targetCol)}`;
    const seenValues = new Set<string>();
    const remainingRowsData: any[][] = [];

    // Header row
    const headerRow: any[] = [];
    for (let c = 0; c < workingSheet.colCount; c++) {
      headerRow.push(getCellValue(workingSheet, 0, c));
    }
    remainingRowsData.push(headerRow);

    for (let r = 1; r < workingSheet.rowCount; r++) {
      const val = getCellValue(workingSheet, r, targetCol);
      const strKey = String(val ?? '').trim().toLowerCase();
      if (!seenValues.has(strKey)) {
        seenValues.add(strKey);
        const rowVals: any[] = [];
        for (let c = 0; c < workingSheet.colCount; c++) {
          rowVals.push(getCellValue(workingSheet, r, c));
        }
        remainingRowsData.push(rowVals);
      }
    }

    const updatedData: Record<string, any> = {};
    remainingRowsData.forEach((rowVals, rIdx) => {
      rowVals.forEach((val, cIdx) => {
        const origCell = workingSheet.data[cellPosToKey(rIdx, cIdx)];
        updatedData[cellPosToKey(rIdx, cIdx)] = {
          raw: String(val ?? ''),
          value: val,
          format: origCell?.format,
        };
      });
    });

    const newSheet = recalculateSheet({
      ...workingSheet,
      rowCount: remainingRowsData.length,
      data: updatedData,
    });

    commitStep(
      'Duplicadas Removidas',
      'remove_duplicates',
      `Eliminadas ${workingSheet.rowCount - remainingRowsData.length} linhas duplicadas em "${targetName}"`,
      newSheet
    );
  };

  // 11. MERGE QUERIES (Mesclar Consultas / Table.NestedJoin)
  const handleApplyMergeResult = (result: MergeQueriesResult) => {
    commitStep(
      `Consultas Mescladas`,
      'merge_columns',
      `${result.matchedCount} linhas correspondentes vinculadas com sucesso`,
      result.sheet,
      { formulaM: result.formulaM }
    );
  };


  // Helper for Type Badges
  const renderTypeBadge = (type: ColumnProfile['inferredType']) => {
    switch (type) {
      case 'time':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-sky-100 text-sky-800 text-[10px] font-bold">
            <Clock className="size-3 text-sky-600" /> HORA
          </span>
        );
      case 'currency':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            <DollarSign className="size-3 text-emerald-600" /> MOEDA
          </span>
        );
      case 'number':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-amber-100 text-amber-900 text-[10px] font-bold">
            <Hash className="size-3 text-amber-600" /> 123
          </span>
        );
      case 'percentage':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-purple-100 text-purple-800 text-[10px] font-bold">
            <Percent className="size-3 text-purple-600" /> %
          </span>
        );
      case 'date':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-pink-100 text-pink-800 text-[10px] font-bold">
            <Calendar className="size-3 text-pink-600" /> DATA
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-700 text-[10px] font-bold">
            <Type className="size-3 text-slate-500" /> TEXT
          </span>
        );
    }
  };

  // Active step formula
  const activeStep = steps[steps.length - 1];
  const activeStepMFormula = activeStep?.params?.formulaM || `= Table.TransformColumnTypes(#"${activeStep?.name || 'Fonte'}", {})`;

  return (
    <div className="h-full flex flex-col bg-slate-100 select-none overflow-hidden text-xs">
      {/* 1. POWER QUERY TOP TITLE BAR */}
      <div className="h-10 px-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <div className="size-6 rounded-xs bg-purple-700 flex items-center justify-center text-white font-black text-xs shadow-2xs">
            PQ
          </div>
          <div>
            <span className="font-bold text-slate-900 text-xs">Editor do Power Query</span>
            <span className="text-[11px] text-slate-500 ml-2">Consulta Ativa: <strong>{workingSheet.name}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onApplyChangesToSheet(workingSheet);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xs bg-purple-700 hover:bg-purple-800 text-white font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Check className="size-3.5" />
            <span>Fechar & Aplicar</span>
          </button>

          <button
            onClick={() => exportSheetToExcel(workingSheet, `${workingSheet.name}_PowerQuery`)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xs bg-[#107c41] hover:bg-[#0e6b37] text-white font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Download className="size-3.5" />
            <span>Exportar XLSX</span>
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-300 transition-colors cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>

      {/* 2. POWER QUERY DESKTOP RIBBON BAR */}
      <div className="bg-white border-b border-slate-200">
        {/* Ribbon Tabs Switcher */}
        <div className="flex items-center px-4 border-b border-slate-100 bg-slate-50 gap-1 text-xs">
          <button
            onClick={() => setActiveTab('home')}
            className={`px-3 py-1.5 font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'home' ? 'border-purple-700 text-purple-900 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Página Inicial
          </button>
          <button
            onClick={() => setActiveTab('transform')}
            className={`px-3 py-1.5 font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'transform' ? 'border-purple-700 text-purple-900 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Transformar
          </button>
          <button
            onClick={() => setActiveTab('add_column')}
            className={`px-3 py-1.5 font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'add_column' ? 'border-purple-700 text-purple-900 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Adicionar Coluna
          </button>
          <button
            onClick={() => setActiveTab('view')}
            className={`px-3 py-1.5 font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'view' ? 'border-purple-700 text-purple-900 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Exibir
          </button>
        </div>

        {/* Ribbon Actions Area */}
        <div className="h-16 px-4 py-1.5 flex items-center gap-4 overflow-x-auto bg-white">
          {/* TAB 1: PÁGINA INICIAL */}
          {activeTab === 'home' && (
            <div className="flex items-center gap-3">
              {/* Group: Fechar */}
              <button
                onClick={() => {
                  onApplyChangesToSheet(workingSheet);
                  onClose();
                }}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-purple-50 rounded-xs text-purple-900 font-semibold cursor-pointer border border-transparent hover:border-purple-200"
              >
                <CheckCircle2 className="size-5 text-purple-700" />
                <span className="text-[10px] mt-0.5">Fechar & Aplicar</span>
              </button>

              <div className="h-10 w-px bg-slate-200" />

              {/* Group: Mesclar Consultas (Table.NestedJoin) */}
              <button
                onClick={() => setIsMergeQueriesOpen(true)}
                title="Mesclar Consultas / Tabelas (Table.NestedJoin) — Conecte duas tabelas por chave de junção"
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-purple-50 rounded-xs text-purple-900 font-semibold cursor-pointer border border-purple-200 bg-purple-50/50"
              >
                <Layers className="size-5 text-purple-700" />
                <span className="text-[10px] mt-0.5 font-bold">Mesclar Consultas</span>
              </button>

              {/* Group: Tipo Automático */}
              <button
                onClick={handleDetectDataTypes}
                title="Examina 100% dos dados e define Tempo (HH:MM:SS), Moeda, Número, Data e Texto automaticamente"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-emerald-50 rounded-xs text-emerald-900 font-semibold cursor-pointer border border-transparent hover:border-emerald-200"
              >
                <Sparkles className="size-5 text-[#107c41]" />
                <span className="text-[10px] mt-0.5">Detectar Tipos</span>
              </button>

              <div className="h-10 w-px bg-slate-200" />

              {/* Group: Mesclar & Dividir Colunas */}
              <button
                onClick={() => {
                  setMergeSelectedCols([selectedColIndex, Math.min(selectedColIndex + 1, workingSheet.colCount - 1)]);
                  setActiveModal('merge_columns');
                }}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Table className="size-5 text-indigo-600" />
                <span className="text-[10px] mt-0.5">Mesclar Colunas</span>
              </button>

              <button
                onClick={() => setActiveModal('split_column')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Split className="size-5 text-blue-600" />
                <span className="text-[10px] mt-0.5">Dividir Coluna</span>
              </button>

              <button
                onClick={() => setActiveModal('replace_values')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Sliders className="size-5 text-amber-600" />
                <span className="text-[10px] mt-0.5">Substituir Valores</span>
              </button>

              <div className="h-10 w-px bg-slate-200" />

              {/* Group: Reduzir Linhas */}
              <button
                onClick={handleRemoveNullRows}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-rose-50 rounded-xs text-rose-900 font-semibold cursor-pointer"
              >
                <Trash2 className="size-5 text-rose-600" />
                <span className="text-[10px] mt-0.5">Remover Nulos</span>
              </button>

              <button
                onClick={handleRemoveDuplicates}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Filter className="size-5 text-slate-600" />
                <span className="text-[10px] mt-0.5">Remover Duplicados</span>
              </button>
            </div>
          )}

          {/* TAB 2: TRANSFORMAR */}
          {activeTab === 'transform' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMergeQueriesOpen(true)}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-purple-50 rounded-xs text-purple-900 font-semibold cursor-pointer border border-purple-200 bg-purple-50/50"
              >
                <Layers className="size-5 text-purple-700" />
                <span className="text-[10px] mt-0.5 font-bold">Mesclar Consultas</span>
              </button>

              <button
                onClick={handleDetectDataTypes}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-emerald-50 rounded-xs text-emerald-900 font-semibold cursor-pointer"
              >
                <Sparkles className="size-5 text-[#107c41]" />
                <span className="text-[10px] mt-0.5">Detectar Tipos Auto</span>
              </button>

              <div className="h-10 w-px bg-slate-200" />

              <button
                onClick={() => handleTextTransform('uppercase')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <span className="font-bold text-base text-purple-700">AA</span>
                <span className="text-[10px]">MAIÚSCULAS</span>
              </button>

              <button
                onClick={() => handleTextTransform('propercase')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <span className="font-bold text-base text-purple-700">Aa</span>
                <span className="text-[10px]">1ª Maiúscula</span>
              </button>

              <button
                onClick={() => handleTextTransform('lowercase')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <span className="font-bold text-base text-purple-700">aa</span>
                <span className="text-[10px]">minúsculas</span>
              </button>

              <button
                onClick={() => handleTextTransform('trim')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Scissors className="size-5 text-slate-600" />
                <span className="text-[10px] mt-0.5">Limpar (Trim)</span>
              </button>

              <div className="h-10 w-px bg-slate-200" />

              <button
                onClick={() => setActiveModal('merge_columns')}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Table className="size-5 text-indigo-600" />
                <span className="text-[10px] mt-0.5">Mesclar Colunas</span>
              </button>
            </div>
          )}

          {/* TAB 3: ADICIONAR COLUNA */}
          {activeTab === 'add_column' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMergeQueriesOpen(true)}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-purple-50 rounded-xs text-purple-900 font-semibold cursor-pointer border border-purple-200 bg-purple-50/50"
              >
                <Layers className="size-5 text-purple-700" />
                <span className="text-[10px] mt-0.5 font-bold">Mesclar Consultas (Nova)</span>
              </button>

              <button
                onClick={() => setActiveModal('custom_column')}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-purple-50 rounded-xs text-purple-900 font-semibold cursor-pointer border border-transparent hover:border-purple-200"
              >
                <PlusCircle className="size-5 text-purple-700" />
                <span className="text-[10px] mt-0.5">Coluna Personalizada</span>
              </button>

              <button
                onClick={() => setActiveModal('conditional_column')}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-blue-50 rounded-xs text-blue-900 font-semibold cursor-pointer border border-transparent hover:border-blue-200"
              >
                <Sliders className="size-5 text-blue-700" />
                <span className="text-[10px] mt-0.5">Coluna Condicional</span>
              </button>

              <button
                onClick={() => handleAddIndexColumn(1)}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Hash className="size-5 text-amber-600" />
                <span className="text-[10px] mt-0.5">Coluna de Índice</span>
              </button>

              <button
                onClick={handleDuplicateColumn}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Copy className="size-5 text-emerald-600" />
                <span className="text-[10px] mt-0.5">Duplicar Coluna</span>
              </button>

              <button
                onClick={() => setActiveModal('merge_columns')}
                className="flex flex-col items-center justify-center px-2.5 py-1 hover:bg-slate-100 rounded-xs text-slate-800 font-semibold cursor-pointer"
              >
                <Table className="size-5 text-indigo-600" />
                <span className="text-[10px] mt-0.5">Mesclar Colunas</span>
              </button>
            </div>
          )}

          {/* TAB 4: EXIBIR */}
          {activeTab === 'view' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xs">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span className="text-xs text-slate-700">Qualidade de Coluna: <strong>Ativa</strong></span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xs">
                <Database className="size-4 text-purple-600" />
                <span className="text-xs text-slate-700">Etapas Aplicadas: <strong>{steps.length} registradas</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* 2.1 POWER QUERY M FORMULA BAR */}
        <div className="h-7 px-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 text-slate-500 font-serif italic font-bold">
            <span>fx</span>
          </div>
          <div className="h-3.5 w-px bg-slate-300" />
          <div className="flex-1 truncate text-slate-800 font-medium text-[11px]">
            {activeStepMFormula}
          </div>
        </div>
      </div>


      {/* 3. MAIN WORKSPACE: GRID + APPLIED STEPS PANEL */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center: Interactive Data Table */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white border-r border-slate-200">
          <div className="flex-1 overflow-auto scrollbar-thin">
            <table className="border-collapse table-fixed w-max text-xs font-mono bg-white">
              {/* Profiling / Quality Header */}
              <thead className="sticky top-0 z-10 bg-white border-b border-slate-300 shadow-2xs">
                <tr>
                  <th className="w-12 h-16 bg-slate-100 border-r border-b border-slate-300 text-slate-500 font-normal text-center select-none">
                    #
                  </th>
                  {columnProfiles.map(cp => {
                    const isSelected = cp.colIndex === selectedColIndex;
                    const validPct = cp.totalCount > 0 ? Math.round((cp.validCount / cp.totalCount) * 100) : 100;

                    return (
                      <th
                        key={cp.colIndex}
                        onClick={() => setSelectedColIndex(cp.colIndex)}
                        style={{ width: `${workingSheet.colWidths[cp.colIndex] || 140}px` }}
                        className={`p-2 border-r border-b border-slate-300 text-left transition-colors cursor-pointer select-none ${
                          isSelected ? 'bg-purple-50/80 border-b-2 border-b-purple-700' : 'bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900 truncate font-sans text-xs">{cp.colName}</span>
                          {renderTypeBadge(cp.inferredType)}
                        </div>

                        {/* Quality Distribution Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex mb-1">
                          <div style={{ width: `${validPct}%` }} className="bg-emerald-500 h-full" />
                          <div style={{ width: `${100 - validPct}%` }} className="bg-slate-300 h-full" />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-sans">
                          <span>{validPct}% válidos</span>
                          <span>{cp.distinctCount} únicos</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Data Rows */}
              <tbody>
                {Array.from({ length: Math.min(workingSheet.rowCount - 1, 100) }).map((_, rIdx) => {
                  const r = rIdx + 1;
                  return (
                    <tr key={r} className="border-b border-slate-200 hover:bg-slate-50/80 transition-colors">
                      <td className="w-12 px-2 py-1.5 bg-slate-50 text-slate-500 text-center border-r border-slate-200 select-none">
                        {r}
                      </td>
                      {columnProfiles.map(cp => {
                        const val = getCellValue(workingSheet, r, cp.colIndex);
                        const cell = workingSheet.data[cellPosToKey(r, cp.colIndex)];
                        const formatted = formatCellValue(val, cell?.format);
                        const isSelected = cp.colIndex === selectedColIndex;

                        return (
                          <td
                            key={cp.colIndex}
                            onClick={() => setSelectedColIndex(cp.colIndex)}
                            className={`px-2 py-1.5 border-r border-slate-200 truncate ${
                              isSelected ? 'bg-purple-50/30' : ''
                            } ${cell?.format?.align === 'center' ? 'text-center' : cell?.format?.align === 'right' ? 'text-right' : 'text-left'}`}
                          >
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Bar: Column Statistics */}
          <div className="h-7 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <div className="flex items-center gap-3">
              <span>Coluna Selecionada: <strong>{activeProfile?.colName}</strong> ({activeProfile?.inferredType})</span>
              <span>•</span>
              <span>Linhas: <strong>{workingSheet.rowCount - 1}</strong></span>
              <span>•</span>
              <span>Válidos: <strong>{activeProfile?.validCount}</strong></span>
              <span>•</span>
              <span>Distintos: <strong>{activeProfile?.distinctCount}</strong></span>
            </div>
            {activeProfile?.sum !== undefined && (
              <div className="font-mono font-bold text-slate-800">
                Soma: {activeProfile.sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Applied Steps (Pipeline Reversível) */}
        <div className="w-72 bg-slate-50 border-l border-slate-200 flex flex-col">
          <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-purple-700" />
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wide">Etapas Aplicadas</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
              {steps.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              return (
                <div
                  key={step.id}
                  className={`p-2.5 rounded-lg border transition-all ${
                    isLast
                      ? 'bg-purple-50/60 border-purple-300 shadow-2xs'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-purple-200 text-purple-800 font-black text-[9px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-900 text-xs">{step.name}</span>
                    </div>

                    {step.id !== 'step-source' && (
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        title="Desfazer e remover esta etapa"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xs transition-colors cursor-pointer"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. MODALS */}
      {/* MODAL: MESCLAR COLUNAS */}
      {activeModal === 'merge_columns' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-purple-950 flex items-center gap-2">
                <Layers className="size-4 text-purple-700" />
                Mesclar Colunas
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Selecione as colunas para mesclar:</label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1.5 bg-slate-50">
                  {columnProfiles.map(cp => {
                    const isChecked = mergeSelectedCols.includes(cp.colIndex);
                    return (
                      <label key={cp.colIndex} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setMergeSelectedCols(mergeSelectedCols.filter(c => c !== cp.colIndex));
                            } else {
                              setMergeSelectedCols([...mergeSelectedCols, cp.colIndex]);
                            }
                          }}
                          className="rounded text-purple-600"
                        />
                        <span className="font-medium text-slate-800">{cp.colName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Separador:</label>
                  <select
                    value={mergeSeparator}
                    onChange={e => setMergeSeparator(e.target.value as any)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-semibold"
                  >
                    <option value="space">Espaço (" ")</option>
                    <option value="hyphen">Hífen (" - ")</option>
                    <option value="comma">Vírgula (", ")</option>
                    <option value="semicolon">Ponto-e-vírgula ("; ")</option>
                    <option value="slash">Barra (" / ")</option>
                    <option value="none">Nenhum ("")</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>

                {mergeSeparator === 'custom' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Separador Custom:</label>
                    <input
                      type="text"
                      value={mergeCustomSep}
                      onChange={e => setMergeCustomSep(e.target.value)}
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nome da Nova Coluna:</label>
                  <input
                    type="text"
                    value={mergeNewColName}
                    onChange={e => setMergeNewColName(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyMergeColumns}
                disabled={mergeSelectedCols.length < 2 || !mergeNewColName.trim()}
                className="px-4 py-1.5 rounded-md bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                Mesclar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COLUNA PERSONALIZADA */}
      {activeModal === 'custom_column' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-purple-950 flex items-center gap-2">
                <PlusCircle className="size-4 text-purple-700" />
                Adicionar Coluna Personalizada
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome da Nova Coluna:</label>
                <input
                  type="text"
                  value={customColName}
                  onChange={e => setCustomColName(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Fórmula da Coluna Personalizada:</label>
                  <textarea
                    rows={4}
                    value={customColFormula}
                    onChange={e => setCustomColFormula(e.target.value)}
                    placeholder="Ex: [Salário Base] * 0.1 ou [Nome] & ' - ' & [Agente ID]"
                    className="w-full p-2 bg-white border border-slate-300 rounded-md font-mono text-xs focus:outline-hidden focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Colunas Disponíveis:</label>
                  <div className="h-28 overflow-y-auto border border-slate-200 rounded p-1 space-y-1 bg-slate-50">
                    {columnProfiles.map(cp => (
                      <button
                        key={cp.colIndex}
                        type="button"
                        onClick={() => setCustomColFormula(prev => `${prev}[${cp.colName}]`)}
                        className="w-full text-left p-1 rounded hover:bg-purple-100 text-[11px] truncate block text-slate-800"
                      >
                        [{cp.colName}]
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700">
                Cancelar
              </button>
              <button
                onClick={handleApplyCustomColumn}
                disabled={!customColName.trim() || !customColFormula.trim()}
                className="px-4 py-1.5 rounded-md bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                Adicionar Coluna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COLUNA CONDICIONAL */}
      {activeModal === 'conditional_column' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-blue-950 flex items-center gap-2">
                <Sliders className="size-4 text-blue-700" />
                Adicionar Coluna Condicional (SE / IF)
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome da Nova Coluna:</label>
                <input
                  type="text"
                  value={condColName}
                  onChange={e => setCondColName(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-semibold"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">Regra de Condição:</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500 block">Se coluna:</label>
                    <select
                      value={condTargetCol}
                      onChange={e => setCondTargetCol(parseInt(e.target.value, 10))}
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                    >
                      {columnProfiles.map(cp => (
                        <option key={cp.colIndex} value={cp.colIndex}>{cp.colName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block">Operador:</label>
                    <select
                      value={condOperator}
                      onChange={e => setCondOperator(e.target.value as any)}
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="equals">é igual a</option>
                      <option value="contains">contém</option>
                      <option value="greater">é maior que</option>
                      <option value="less">é menor que</option>
                      <option value="not_empty">não está vazio</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block">Valor:</label>
                    <input
                      type="text"
                      value={condCompareVal}
                      onChange={e => setCondCompareVal(e.target.value)}
                      placeholder="Ex: Almoço"
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="text-[11px] text-slate-700 font-bold block">Então gerar saída:</label>
                    <input
                      type="text"
                      value={condOutputVal}
                      onChange={e => setCondOutputVal(e.target.value)}
                      placeholder="Ex: Pausa Longa"
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs font-semibold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 font-bold block">Senão gerar saída:</label>
                    <input
                      type="text"
                      value={condElseVal}
                      onChange={e => setCondElseVal(e.target.value)}
                      placeholder="Ex: Normal"
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700">
                Cancelar
              </button>
              <button
                onClick={handleApplyConditionalColumn}
                disabled={!condColName.trim() || !condOutputVal.trim()}
                className="px-4 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                Adicionar Coluna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUBSTITUIR VALORES */}
      {activeModal === 'replace_values' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2">
                <Sliders className="size-4 text-amber-700" />
                Substituir Valores
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Coluna Ativa:</label>
                <div className="p-2 bg-slate-100 rounded text-slate-800 font-semibold">{activeProfile?.colName}</div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Valor a Localizar:</label>
                <input
                  type="text"
                  value={replaceOldVal}
                  onChange={e => setReplaceOldVal(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Substituir Por:</label>
                <input
                  type="text"
                  value={replaceNewVal}
                  onChange={e => setReplaceNewVal(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700">
                Cancelar
              </button>
              <button
                onClick={handleApplyReplaceValues}
                disabled={!replaceOldVal.trim()}
                className="px-4 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                Substituir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DIVIDIR COLUNA */}
      {activeModal === 'split_column' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-blue-950 flex items-center gap-2">
                <Split className="size-4 text-blue-700" />
                Dividir Coluna por Delimitador
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Coluna Ativa:</label>
                <div className="p-2 bg-slate-100 rounded text-slate-800 font-semibold">{activeProfile?.colName}</div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Delimitador:</label>
                <select
                  value={splitChar}
                  onChange={e => setSplitChar(e.target.value)}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs font-semibold"
                >
                  <option value=";">Ponto-e-vírgula (;)</option>
                  <option value=",">Vírgula (,)</option>
                  <option value=" ">Espaço ( )</option>
                  <option value="-">Hífen (-)</option>
                  <option value="/">Barra (/)</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700">
                Cancelar
              </button>
              <button
                onClick={() => {
                  const updatedData = { ...workingSheet.data };
                  const targetCol = selectedColIndex;
                  for (let r = 1; r < workingSheet.rowCount; r++) {
                    const key = cellPosToKey(r, targetCol);
                    if (updatedData[key]) {
                      const parts = String(updatedData[key].raw ?? '').split(splitChar);
                      parts.forEach((part, idx) => {
                        const destKey = cellPosToKey(r, targetCol + idx);
                        updatedData[destKey] = { raw: part.trim(), value: part.trim() };
                      });
                    }
                  }
                  const newSheet = recalculateSheet({ ...workingSheet, data: updatedData });
                  commitStep('Dividir Coluna', 'split_column', `Dividida por "${splitChar}"`, newSheet);
                  setActiveModal(null);
                }}
                className="px-4 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
              >
                Dividir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MESCLAR CONSULTAS (TABLE.NESTEDJOIN) */}
      <MergeQueriesModal
        isOpen={isMergeQueriesOpen}
        onClose={() => setIsMergeQueriesOpen(false)}
        primarySheet={workingSheet}
        allSheets={allSheets}
        onApplyMergeResult={handleApplyMergeResult}
      />
    </div>
  );
};

