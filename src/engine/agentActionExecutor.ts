import { Sheet, CellData, CellRange } from '../types/spreadsheet';
import { AgentAction } from './agentActionProtocol';
import { recalculateSheet, cellPosToKey, keyToCellPos } from './formulaParser';
import { createEmptySheet } from '../data/sampleDatasets';

export interface ActionResult {
  updatedSheets: Sheet[];
  newActiveSheetId: string;
  affectedCellsCount: number;
  message: string;
}

export function applyAgentActions(
  currentSheets: Sheet[],
  activeSheetId: string,
  actions: AgentAction[]
): ActionResult {
  let sheets = [...currentSheets];
  let activeId = activeSheetId;
  let affectedCount = 0;
  const messages: string[] = [];

  for (const action of actions) {
    if (action.type === 'create_sheet_from_scratch') {
      const newSheetId = `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const numRows = Math.max(100, (action.rows?.length || 0) + 20);
      const numCols = Math.max(26, (action.columns?.length || 0) + 5);
      const newSheet = createEmptySheet(newSheetId, action.sheetName || 'Nova Planilha', numRows, numCols);
      const newData: { [key: string]: CellData } = {};

      // 1. Cabeçalhos na Linha 0
      if (action.columns && action.columns.length > 0) {
        action.columns.forEach((colName, colIdx) => {
          const key = cellPosToKey(0, colIdx);
          newData[key] = {
            raw: String(colName),
            value: String(colName),
            format: {
              bold: true,
              bgColor: '#1e293b',
              textColor: '#ffffff',
              align: 'center',
            },
          };
          affectedCount++;
        });
      }

      // 2. Linhas de Dados
      if (action.rows && Array.isArray(action.rows)) {
        action.rows.forEach((rowVals, rowIdx) => {
          const r = rowIdx + 1;
          rowVals.forEach((val, colIdx) => {
            const key = cellPosToKey(r, colIdx);
            const rawStr = val === null || val === undefined ? '' : String(val);
            const isFormula = rawStr.startsWith('=');
            
            let customFormat = action.formats?.[`${r},${colIdx}`] || action.formats?.[`*,${colIdx}`];
            if (!customFormat && typeof val === 'number') {
              if (rawStr.includes('.') || Math.abs(val) > 100) {
                customFormat = { align: 'right' };
              }
            }

            newData[key] = {
              raw: rawStr,
              value: isFormula ? null : (typeof val === 'number' ? val : rawStr),
              format: customFormat ? { ...customFormat } : undefined,
            };
            affectedCount++;
          });
        });
      }

      newSheet.data = newData;
      const recalculated = recalculateSheet(newSheet, sheets);
      sheets.push(recalculated);
      activeId = newSheetId;
      messages.push(`Criada nova planilha "${action.sheetName}" com ${action.rows?.length || 0} linhas.`);
    } 
    else if (action.type === 'set_cells') {
      const sheetIndex = sheets.findIndex(s => s.id === activeId);
      if (sheetIndex !== -1) {
        const targetSheet = { ...sheets[sheetIndex], data: { ...sheets[sheetIndex].data } };
        action.cells.forEach(cell => {
          const key = cellPosToKey(cell.row, cell.col);
          const prev = targetSheet.data[key];
          const isFormula = cell.raw.startsWith('=');
          
          targetSheet.data[key] = {
            raw: cell.raw,
            value: isFormula ? (prev?.value ?? null) : cell.raw,
            format: cell.format ? { ...prev?.format, ...cell.format } : prev?.format,
          };
          affectedCount++;
        });

        sheets[sheetIndex] = recalculateSheet(targetSheet, sheets);
        messages.push(`${action.cells.length} células atualizadas.`);
      }
    }
    else if (action.type === 'delete_columns') {
      const sheetIndex = sheets.findIndex(s => s.id === activeId);
      if (sheetIndex !== -1) {
        const targetSheet = { ...sheets[sheetIndex], data: { ...sheets[sheetIndex].data } };
        const colsToDelete = new Set(action.colIndices);
        const nextData: { [key: string]: CellData } = {};

        Object.entries(targetSheet.data).forEach(([key, cellData]) => {
          const pos = keyToCellPos(key);
          if (pos && !colsToDelete.has(pos.col)) {
            const shift = action.colIndices.filter(c => c < pos.col).length;
            const newKey = cellPosToKey(pos.row, pos.col - shift);
            nextData[newKey] = cellData;
          } else {
            affectedCount++;
          }
        });

        targetSheet.data = nextData;
        sheets[sheetIndex] = recalculateSheet(targetSheet, sheets);
        messages.push(`${action.colIndices.length} colunas excluídas.`);
      }
    }
    else if (action.type === 'delete_rows') {
      const sheetIndex = sheets.findIndex(s => s.id === activeId);
      if (sheetIndex !== -1) {
        const targetSheet = { ...sheets[sheetIndex], data: { ...sheets[sheetIndex].data } };
        const rowsToDelete = new Set(action.rowIndices);
        const nextData: { [key: string]: CellData } = {};

        Object.entries(targetSheet.data).forEach(([key, cellData]) => {
          const pos = keyToCellPos(key);
          if (pos && !rowsToDelete.has(pos.row)) {
            const shift = action.rowIndices.filter(r => r < pos.row).length;
            const newKey = cellPosToKey(pos.row - shift, pos.col);
            nextData[newKey] = cellData;
          } else {
            affectedCount++;
          }
        });

        targetSheet.data = nextData;
        sheets[sheetIndex] = recalculateSheet(targetSheet, sheets);
        messages.push(`${action.rowIndices.length} linhas excluídas.`);
      }
    }
    else if (action.type === 'clear_range') {
      const sheetIndex = sheets.findIndex(s => s.id === activeId);
      if (sheetIndex !== -1) {
        const targetSheet = { ...sheets[sheetIndex], data: { ...sheets[sheetIndex].data } };
        const { startRow, startCol, endRow, endCol } = action.range;

        for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
          for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
            const key = cellPosToKey(r, c);
            if (targetSheet.data[key]) {
              if (action.clearFormatting) {
                delete targetSheet.data[key];
              } else {
                targetSheet.data[key] = {
                  raw: '',
                  value: '',
                  format: targetSheet.data[key].format,
                };
              }
              affectedCount++;
            }
          }
        }

        sheets[sheetIndex] = recalculateSheet(targetSheet, sheets);
        messages.push(`Intervalo limpo.`);
      }
    }
    else if (action.type === 'format_range') {
      const sheetIndex = sheets.findIndex(s => s.id === activeId);
      if (sheetIndex !== -1) {
        const targetSheet = { ...sheets[sheetIndex], data: { ...sheets[sheetIndex].data } };
        const { startRow, startCol, endRow, endCol } = action.range;

        for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
          for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
            const key = cellPosToKey(r, c);
            const prev = targetSheet.data[key] || { raw: '', value: '' };
            targetSheet.data[key] = {
              ...prev,
              format: { ...prev.format, ...action.format },
            };
            affectedCount++;
          }
        }

        sheets[sheetIndex] = targetSheet;
        messages.push(`Formatação aplicada em ${affectedCount} células.`);
      }
    }
  }

  return {
    updatedSheets: sheets,
    newActiveSheetId: activeId,
    affectedCellsCount: affectedCount,
    message: messages.join(' ') || 'Ações executadas com sucesso.',
  };
}
