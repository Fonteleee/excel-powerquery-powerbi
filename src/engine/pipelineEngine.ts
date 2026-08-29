import { Sheet } from '../types/spreadsheet';
import { RelationNode, RelationEdge } from '../types/relations';
import { cellPosToKey, parseNumberSafely, recalculateSheet } from './formulaParser';
import { createEmptySheet } from '../data/sampleDatasets';
import { getColumnHeaderName } from './relationFormulaEngine';

export interface PipelineExecutionResult {
  updatedSheets: Sheet[];
  outputSheetIds: string[];
  executionLogs: string[];
}

/**
 * Extracts table data from a Sheet as an array of row objects
 */
export function extractSheetRecords(sheet: Sheet): { headers: string[]; rows: Record<string, any>[] } {
  const headers: string[] = [];
  for (let c = 0; c < sheet.colCount; c++) {
    headers.push(getColumnHeaderName(sheet, c));
  }

  const rows: Record<string, any>[] = [];
  for (let r = 1; r < sheet.rowCount; r++) {
    let hasData = false;
    const rowObj: Record<string, any> = {};
    for (let c = 0; c < sheet.colCount; c++) {
      const val = sheet.data[cellPosToKey(r, c)]?.value;
      if (val !== null && val !== undefined && val !== '') hasData = true;
      rowObj[headers[c]] = val;
    }
    if (hasData) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

/**
 * Executes a Group By & Aggregate transformation
 */
export function executeGroupBy(
  records: Record<string, any>[],
  groupKeyCols: string[],
  aggregations: { colName: string; aggType: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'; outputName?: string }[]
): { headers: string[]; rows: Record<string, any>[] } {
  if (records.length === 0) return { headers: [], rows: [] };

  const groups = new Map<string, Record<string, any>[]>();
  for (const row of records) {
    const key = groupKeyCols.map(c => String(row[c] ?? '(Vazio)')).join(' | ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const outputHeaders: string[] = [
    ...groupKeyCols,
    ...aggregations.map(a => a.outputName || `${a.aggType}_${a.colName}`),
  ];

  const outputRows: Record<string, any>[] = [];
  for (const [, groupItems] of groups.entries()) {
    const outRow: Record<string, any> = {};
    const first = groupItems[0];
    for (const keyCol of groupKeyCols) {
      outRow[keyCol] = first[keyCol];
    }

    for (const agg of aggregations) {
      const outColName = agg.outputName || `${agg.aggType}_${agg.colName}`;
      if (agg.aggType === 'COUNT') {
        outRow[outColName] = groupItems.filter(r => r[agg.colName] !== null && r[agg.colName] !== undefined && r[agg.colName] !== '').length;
      } else {
        const nums = groupItems
          .map(r => parseNumberSafely(r[agg.colName], true))
          .filter((n): n is number => n !== null);

        if (nums.length === 0) {
          outRow[outColName] = 0;
        } else if (agg.aggType === 'SUM') {
          outRow[outColName] = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
        } else if (agg.aggType === 'AVG') {
          outRow[outColName] = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
        } else if (agg.aggType === 'MIN') {
          outRow[outColName] = Math.min(...nums);
        } else if (agg.aggType === 'MAX') {
          outRow[outColName] = Math.max(...nums);
        }
      }
    }
    outputRows.push(outRow);
  }

  return { headers: outputHeaders, rows: outputRows };
}

/**
 * Executes a Filter transformation
 */
export function executeFilter(
  records: Record<string, any>[],
  conditions: { colName: string; operator: string; value: string }[]
): Record<string, any>[] {
  return records.filter(row => {
    for (const cond of conditions) {
      const rawVal = row[cond.colName];
      const targetStr = String(cond.value).trim().toLowerCase();
      const rowValStr = String(rawVal ?? '').trim().toLowerCase();
      const numRow = parseNumberSafely(rawVal, true);
      const numTarget = parseNumberSafely(cond.value, true);

      if (cond.operator === '=') {
        if (numRow !== null && numTarget !== null) {
          if (numRow !== numTarget) return false;
        } else if (rowValStr !== targetStr) return false;
      } else if (cond.operator === '<>') {
        if (numRow !== null && numTarget !== null) {
          if (numRow === numTarget) return false;
        } else if (rowValStr === targetStr) return false;
      } else if (cond.operator === '>') {
        if (numRow === null || numTarget === null || numRow <= numTarget) return false;
      } else if (cond.operator === '<') {
        if (numRow === null || numTarget === null || numRow >= numTarget) return false;
      } else if (cond.operator === '>=') {
        if (numRow === null || numTarget === null || numRow < numTarget) return false;
      } else if (cond.operator === '<=') {
        if (numRow === null || numTarget === null || numRow > numTarget) return false;
      } else if (cond.operator === 'contains') {
        if (!rowValStr.includes(targetStr)) return false;
      }
    }
    return true;
  });
}

/**
 * Converts row objects dataset into a full Sheet structure
 */
export function createSheetFromDataset(
  sheetId: string,
  sheetName: string,
  headers: string[],
  rows: Record<string, any>[]
): Sheet {
  const rowCount = Math.max(rows.length + 1, 30);
  const colCount = Math.max(headers.length, 10);
  const sheet = createEmptySheet(sheetId, sheetName, rowCount, colCount);
  const data = { ...sheet.data };

  // Set Headers (Row 0)
  headers.forEach((h, cIdx) => {
    data[cellPosToKey(0, cIdx)] = {
      raw: h,
      value: h,
      format: { bold: true, bgColor: '#107C41', textColor: '#ffffff' },
    };
  });

  // Set Rows
  rows.forEach((rObj, rIdx) => {
    const r = rIdx + 1;
    headers.forEach((h, cIdx) => {
      const val = rObj[h];
      data[cellPosToKey(r, cIdx)] = {
        raw: val === null || val === undefined ? '' : String(val),
        value: val,
      };
    });
  });

  return recalculateSheet({ ...sheet, data });
}

/**
 * High-Speed Multi-Column Smart Lookup Enrichment (Ideia 1)
 */
export function applyMultiColumnEnrichment(
  sourceSheet: Sheet,
  targetSheet: Sheet,
  sourceKeyColIdx: number,
  targetKeyColIdx: number,
  returnColIndices: number[],
  prefix = '',
  ifNotFound = 'Não Encontrado',
  allSheets: Sheet[] = [sourceSheet, targetSheet]
): { updatedSheets: Sheet[]; matchRate: number; addedColumns: string[] } {
  // Calculate match percentage
  const sourceKeys: any[] = [];
  for (let r = 1; r < sourceSheet.rowCount; r++) {
    const k = sourceSheet.data[cellPosToKey(r, sourceKeyColIdx)]?.value;
    if (k !== null && k !== undefined && k !== '') sourceKeys.push(k);
  }

  const targetKeySet = new Set<string>();
  for (let r = 1; r < targetSheet.rowCount; r++) {
    const k = targetSheet.data[cellPosToKey(r, targetKeyColIdx)]?.value;
    if (k !== null && k !== undefined && k !== '') targetKeySet.add(String(k).trim().toLowerCase());
  }

  let matched = 0;
  for (const sk of sourceKeys) {
    if (targetKeySet.has(String(sk).trim().toLowerCase())) matched++;
  }
  const matchRate = sourceKeys.length > 0 ? (matched / sourceKeys.length) * 100 : 100;

  const targetKeyColLetter = String.fromCharCode(65 + targetKeyColIdx);
  const sourceKeyColLetter = String.fromCharCode(65 + sourceKeyColIdx);
  const targetSheetNameFormatted = targetSheet.name.includes(' ') ? `'${targetSheet.name}'` : targetSheet.name;

  const addedColumns: string[] = [];
  const newData = { ...sourceSheet.data };
  let nextCol = sourceSheet.colCount;

  returnColIndices.forEach(retColIdx => {
    const retHeader = getColumnHeaderName(targetSheet, retColIdx);
    const newHeaderName = prefix ? `${prefix} - ${retHeader}` : `${targetSheet.name.slice(0, 8)}_${retHeader}`;
    const retColLetter = String.fromCharCode(65 + retColIdx);
    addedColumns.push(newHeaderName);

    // Header
    newData[cellPosToKey(0, nextCol)] = {
      raw: newHeaderName,
      value: newHeaderName,
      format: { bold: true, bgColor: '#4f46e5', textColor: '#ffffff' },
    };

    // Formulas
    for (let r = 1; r < sourceSheet.rowCount; r++) {
      const sourceVal = sourceSheet.data[cellPosToKey(r, sourceKeyColIdx)]?.value;
      if (sourceVal !== null && sourceVal !== undefined && sourceVal !== '' || r < 30) {
        const formula = `=PROCX(${sourceKeyColLetter}${r + 1}; ${targetSheetNameFormatted}!${targetKeyColLetter}:${targetKeyColLetter}; ${targetSheetNameFormatted}!${retColLetter}:${retColLetter}; "${ifNotFound}")`;
        newData[cellPosToKey(r, nextCol)] = {
          raw: formula,
          value: '',
        };
      }
    }
    nextCol++;
  });

  const updatedSourceSheet = recalculateSheet(
    { ...sourceSheet, colCount: nextCol, data: newData },
    allSheets
  );

  const updatedSheets = allSheets.map(s => (s.id === sourceSheet.id ? updatedSourceSheet : s));
  return { updatedSheets, matchRate, addedColumns };
}
