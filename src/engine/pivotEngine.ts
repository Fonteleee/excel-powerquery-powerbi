import { Sheet } from '../types/spreadsheet';
import { PivotConfig, PivotResult, PivotCell, AggregationType } from '../types/analytics';
import { getCellValue, parseNumberSafely } from './formulaParser';

export function computePivotTable(sheet: Sheet, config: PivotConfig): PivotResult {
  // 1. Extract headers (Row 0)
  const headerRow = 0;
  const colHeaders: string[] = [];
  for (let c = 0; c < sheet.colCount; c++) {
    const val = getCellValue(sheet, headerRow, c);
    colHeaders.push(val ? String(val).trim() : `Col ${c + 1}`);
  }

  // 2. Extract data rows
  const dataRows: Record<number, any>[] = [];
  for (let r = 1; r < sheet.rowCount; r++) {
    let hasAnyData = false;
    const rowObj: Record<number, any> = {};
    for (let c = 0; c < sheet.colCount; c++) {
      const val = getCellValue(sheet, r, c);
      if (val !== null && val !== undefined && val !== '') hasAnyData = true;
      rowObj[c] = val;
    }
    if (hasAnyData) {
      // Check filters
      let passesFilter = true;
      for (const [colIdxStr, allowedVals] of Object.entries(config.filterIndices)) {
        const colIdx = parseInt(colIdxStr, 10);
        if (allowedVals && allowedVals.length > 0) {
          const cellVal = String(rowObj[colIdx] ?? '').trim();
          if (!allowedVals.includes(cellVal)) {
            passesFilter = false;
            break;
          }
        }
      }
      if (passesFilter) {
        dataRows.push(rowObj);
      }
    }
  }

  if (config.rowFieldIndices.length === 0 && config.columnFieldIndices.length === 0 && config.valueFields.length === 0) {
    return {
      headers: ['Nenhum campo selecionado'],
      rows: [],
      summaryCardValues: [],
    };
  }

  // 3. Find unique values for Column Fields (pivot columns)
  const colPivotValues: string[] = [];
  if (config.columnFieldIndices.length > 0) {
    const colField = config.columnFieldIndices[0];
    const uniqueCols = new Set<string>();
    dataRows.forEach(row => {
      const val = String(row[colField] ?? '(Vazio)').trim();
      uniqueCols.add(val);
    });
    colPivotValues.push(...Array.from(uniqueCols).sort());
  }

  // 4. Group data rows by Row Fields
  const rowGroups = new Map<string, Record<number, any>[]>();
  dataRows.forEach(row => {
    const key = config.rowFieldIndices.length > 0
      ? config.rowFieldIndices.map(idx => String(row[idx] ?? '(Vazio)').trim()).join(' | ')
      : 'Total Geral';

    if (!rowGroups.has(key)) rowGroups.set(key, []);
    rowGroups.get(key)!.push(row);
  });

  // 5. Build Headers
  const tableHeaders: string[] = [];
  if (config.rowFieldIndices.length > 0) {
    config.rowFieldIndices.forEach(idx => {
      tableHeaders.push(colHeaders[idx] || `Campo ${idx + 1}`);
    });
  } else {
    tableHeaders.push('Total');
  }

  if (colPivotValues.length > 0) {
    colPivotValues.forEach(colVal => {
      config.valueFields.forEach(vf => {
        const valName = vf.customLabel || `${vf.aggregation} de ${vf.colName}`;
        tableHeaders.push(`${colVal} - ${valName}`);
      });
    });
  } else {
    config.valueFields.forEach(vf => {
      const valName = vf.customLabel || `${vf.aggregation} de ${vf.colName}`;
      tableHeaders.push(valName);
    });
  }

  if (config.showRowTotals && (colPivotValues.length > 0 || config.valueFields.length > 0)) {
    config.valueFields.forEach(vf => {
      tableHeaders.push(`Total - ${vf.customLabel || vf.colName}`);
    });
  }

  // 6. Build Row Data & Cells
  const resultRows: PivotResult['rows'] = [];
  const grandTotalItems: Record<number, any>[] = [...dataRows];

  // Calculate overall grand total sum for percentages
  let overallSum = 0;
  if (config.valueFields.length > 0) {
    const firstValField = config.valueFields[0];
    overallSum = dataRows.reduce((acc, r) => acc + (parseNumberSafely(r[firstValField.colIndex]) || 0), 0);
  }

  // Iterate groups
  rowGroups.forEach((items, groupKey) => {
    const labels = config.rowFieldIndices.length > 0 ? groupKey.split(' | ') : ['Total'];
    const cells: PivotCell[] = [];

    if (colPivotValues.length > 0) {
      colPivotValues.forEach(colVal => {
        const colField = config.columnFieldIndices[0];
        const subItems = items.filter(r => String(r[colField] ?? '(Vazio)').trim() === colVal);

        config.valueFields.forEach(vf => {
          const num = aggregateValues(subItems, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
          cells.push(formatPivotCell(num, vf.aggregation));
        });
      });
    } else {
      config.valueFields.forEach(vf => {
        const num = aggregateValues(items, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
        cells.push(formatPivotCell(num, vf.aggregation));
      });
    }

    // Row total
    if (config.showRowTotals && (colPivotValues.length > 0 || config.valueFields.length > 0)) {
      config.valueFields.forEach(vf => {
        const num = aggregateValues(items, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
        cells.push(formatPivotCell(num, vf.aggregation, true));
      });
    }

    resultRows.push({
      label: labels,
      cells,
    });
  });

  // Grand Total Row
  if (config.showColumnTotals && resultRows.length > 0) {
    const grandCells: PivotCell[] = [];
    if (colPivotValues.length > 0) {
      colPivotValues.forEach(colVal => {
        const colField = config.columnFieldIndices[0];
        const subItems = grandTotalItems.filter(r => String(r[colField] ?? '(Vazio)').trim() === colVal);
        config.valueFields.forEach(vf => {
          const num = aggregateValues(subItems, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
          grandCells.push(formatPivotCell(num, vf.aggregation, false, true));
        });
      });
    } else {
      config.valueFields.forEach(vf => {
        const num = aggregateValues(grandTotalItems, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
        grandCells.push(formatPivotCell(num, vf.aggregation, false, true));
      });
    }

    if (config.showRowTotals && (colPivotValues.length > 0 || config.valueFields.length > 0)) {
      config.valueFields.forEach(vf => {
        const num = aggregateValues(grandTotalItems, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
        grandCells.push(formatPivotCell(num, vf.aggregation, true, true));
      });
    }

    resultRows.push({
      label: ['Total Geral'],
      cells: grandCells,
      isGrandTotal: true,
    });
  }

  // Summary Cards for Quick Analytics
  const summaryCardValues: PivotResult['summaryCardValues'] = [];
  config.valueFields.forEach(vf => {
    const total = aggregateValues(dataRows, vf.colIndex, vf.aggregation, vf.weightColIndex, overallSum);
    const formatted = formatPivotCell(total, vf.aggregation).formatted;
    summaryCardValues.push({
      label: `Total de ${vf.customLabel || vf.colName}`,
      value: formatted,
    });
  });

  return {
    headers: tableHeaders,
    rows: resultRows,
    summaryCardValues,
  };
}

function aggregateValues(
  items: Record<number, any>[],
  colIndex: number,
  agg: AggregationType,
  weightColIndex?: number,
  overallSum?: number
): number {
  if (items.length === 0) return 0;

  if (agg === 'COUNT') {
    return items.filter(r => r[colIndex] !== null && r[colIndex] !== undefined && r[colIndex] !== '').length;
  }

  if (agg === 'COUNT_DISTINCT') {
    const set = new Set<string>();
    items.forEach(r => {
      const v = String(r[colIndex] ?? '').trim();
      if (v) set.add(v);
    });
    return set.size;
  }

  const numbers = items
    .map(r => parseNumberSafely(r[colIndex], true))
    .filter((n): n is number => n !== null);

  if (numbers.length === 0) return 0;

  if (agg === 'SUM') {
    return numbers.reduce((a, b) => a + b, 0);
  }

  if (agg === 'AVERAGE') {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  if (agg === 'MIN') {
    return Math.min(...numbers);
  }

  if (agg === 'MAX') {
    return Math.max(...numbers);
  }

  if (agg === 'PERCENT_OF_TOTAL') {
    const sum = numbers.reduce((a, b) => a + b, 0);
    return overallSum && overallSum > 0 ? (sum / overallSum) * 100 : 0;
  }

  if (agg === 'WEIGHTED_AVG' && weightColIndex !== undefined) {
    let sumProd = 0;
    let sumWeights = 0;
    items.forEach(r => {
      const v = parseNumberSafely(r[colIndex]);
      const w = parseNumberSafely(r[weightColIndex]);
      if (v !== null && w !== null) {
        sumProd += v * w;
        sumWeights += w;
      }
    });
    return sumWeights > 0 ? sumProd / sumWeights : 0;
  }

  if (agg === 'SUMPRODUCT' && weightColIndex !== undefined) {
    let sumProd = 0;
    items.forEach(r => {
      const v = parseNumberSafely(r[colIndex]);
      const w = parseNumberSafely(r[weightColIndex]);
      if (v !== null && w !== null) {
        sumProd += v * w;
      }
    });
    return sumProd;
  }

  return numbers.reduce((a, b) => a + b, 0);
}

function formatPivotCell(
  val: number,
  agg: AggregationType,
  isTotal?: boolean,
  isGrandTotal?: boolean
): PivotCell {
  let formatted = '';
  if (agg === 'PERCENT_OF_TOTAL') {
    formatted = `${val.toFixed(1)}%`;
  } else if (agg === 'COUNT' || agg === 'COUNT_DISTINCT') {
    formatted = val.toLocaleString('pt-BR');
  } else if (val >= 100 || val % 1 !== 0) {
    formatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    formatted = val.toLocaleString('pt-BR');
  }

  return {
    value: val,
    formatted,
    isTotal,
    isHeader: isGrandTotal,
  };
}
