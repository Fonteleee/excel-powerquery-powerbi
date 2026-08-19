import { Sheet } from '../types/spreadsheet';
import { ColumnProfile } from '../types/powerquery';
import { colIndexToLabel, getCellValue, parseNumberSafely } from './formulaParser';

export function profileSheetColumns(sheet: Sheet, headerRowIndex = 0): ColumnProfile[] {
  const profiles: ColumnProfile[] = [];

  // Find actual used columns and rows
  let maxColUsed = 0;
  let maxRowUsed = 0;

  for (const [key, cell] of Object.entries(sheet.data)) {
    if (cell && (cell.raw || cell.value !== null)) {
      const match = key.match(/^R(\d+)C(\d+)$/);
      if (match) {
        const r = parseInt(match[1], 10);
        const c = parseInt(match[2], 10);
        if (r > maxRowUsed) maxRowUsed = r;
        if (c > maxColUsed) maxColUsed = c;
      }
    }
  }

  const effectiveCols = Math.min(Math.max(maxColUsed + 1, 6), sheet.colCount);
  const effectiveRows = Math.min(Math.max(maxRowUsed + 1, 10), sheet.rowCount);

  for (let c = 0; c < effectiveCols; c++) {
    const rawHeader = getCellValue(sheet, headerRowIndex, c);
    const colName = rawHeader !== null && rawHeader !== undefined && String(rawHeader).trim() !== ''
      ? String(rawHeader).trim()
      : `Coluna ${colIndexToLabel(c)}`;

    let validCount = 0;
    let emptyCount = 0;
    let errorCount = 0;
    const valueMap = new Map<string, number>();

    const numbers: number[] = [];
    let timeTypeCount = 0;
    let numberTypeCount = 0;
    let dateTypeCount = 0;
    let currencyTypeCount = 0;
    let percentageTypeCount = 0;
    let booleanTypeCount = 0;


    const isHeaderTimeKeyword = /tempo|hora|pausa|logado|dura[cç][aã]o|perman[eê]ncia|chamada|atendimento|time/i.test(colName);
    const isHeaderCurrencyKeyword = /pre[cç]o|valor|sal[aá]rio|faturamento|custo|lucro|receita|venda|r\$/i.test(colName);

    const dataStartRow = headerRowIndex + 1;
    const totalDataRows = Math.max(effectiveRows - dataStartRow, 0);

    for (let r = dataStartRow; r < effectiveRows; r++) {
      const val = getCellValue(sheet, r, c);
      if (val === null || val === undefined || val === '') {
        emptyCount++;
        continue;
      }

      const strVal = String(val).trim();
      if (strVal.startsWith('#')) {
        errorCount++;
        continue;
      }

      validCount++;
      valueMap.set(strVal, (valueMap.get(strVal) || 0) + 1);

      // Type inference test
      if (strVal.toUpperCase() === 'VERDADEIRO' || strVal.toUpperCase() === 'FALSO' || typeof val === 'boolean') {
        booleanTypeCount++;
      } else if (strVal.includes('R$') || strVal.includes('$') || strVal.includes('€') || (isHeaderCurrencyKeyword && parseNumberSafely(strVal) !== null)) {
        currencyTypeCount++;
        const num = parseNumberSafely(strVal);
        if (num !== null) numbers.push(num);
      } else if (strVal.endsWith('%')) {
        percentageTypeCount++;
        const num = parseNumberSafely(strVal);
        if (num !== null) numbers.push(num);
      } else if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(strVal) || isHeaderTimeKeyword || /^(?:\d+\s*h(?:oras?)?)?\s*(?:\d+\s*m(?:in(?:utos?)?)?)?\s*(?:\d+\s*s(?:eg(?:undos?)?)?)?$/i.test(strVal)) {
        timeTypeCount++;
      } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
        dateTypeCount++;
      } else {
        const num = parseNumberSafely(val);
        if (num !== null && !isNaN(num)) {
          numberTypeCount++;
          numbers.push(num);
        }
      }
    }

    // Determine dominant type
    let inferredType: ColumnProfile['inferredType'] = 'text';
    if (timeTypeCount > validCount * 0.35 || (isHeaderTimeKeyword && validCount > 0)) inferredType = 'time';
    else if (currencyTypeCount > validCount * 0.35 || (isHeaderCurrencyKeyword && validCount > 0)) inferredType = 'currency';
    else if (percentageTypeCount > validCount * 0.35) inferredType = 'percentage';
    else if (numberTypeCount > validCount * 0.35) inferredType = 'number';
    else if (dateTypeCount > validCount * 0.35) inferredType = 'date';
    else if (booleanTypeCount > validCount * 0.35) inferredType = 'boolean';


    // Stats
    let min: number | string | undefined;
    let max: number | string | undefined;
    let avg: number | undefined;
    let sum: number | undefined;

    if (numbers.length > 0) {
      sum = numbers.reduce((acc, curr) => acc + curr, 0);
      avg = sum / numbers.length;
      min = Math.min(...numbers);
      max = Math.max(...numbers);
    }

    // Top values
    const topValues = Array.from(valueMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({
        value,
        count,
        percentage: totalDataRows > 0 ? (count / totalDataRows) * 100 : 0,
      }));

    profiles.push({
      colIndex: c,
      colName,
      totalCount: totalDataRows,
      validCount,
      emptyCount,
      errorCount,
      distinctCount: valueMap.size,
      inferredType,
      min,
      max,
      avg,
      sum,
      topValues,
    });
  }

  return profiles;
}
