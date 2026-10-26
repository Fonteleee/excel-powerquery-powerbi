// src/components/Grid/gridOps.ts
// Operações de dados da grade (ordenar linhas, excluir linhas). Funções puras.

import { CellData, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, getCellValue, parseNumberSafely } from '../../engine/formulaParser';
import { dataColumns } from '../../engine/sheetColumns';

/** Ordena as linhas de dados (a linha 0 é o cabeçalho) pela coluna indicada. */
export function sortRowsData(sheet: Sheet, colIndex: number, direction: 'asc' | 'desc'): { [key: string]: CellData } {
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
  const columns = dataColumns(sheet);
  for (const c of columns) {
    const k0 = cellPosToKey(0, c);
    if (sheet.data[k0]) updatedData[k0] = sheet.data[k0];
  }

  // Map sorted data rows
  dataRowIndices.forEach((origRowIdx, targetIdx) => {
    const newRowIdx = targetIdx + 1;
    for (const c of columns) {
      const srcKey = cellPosToKey(origRowIdx, c);
      const destKey = cellPosToKey(newRowIdx, c);
      if (sheet.data[srcKey]) {
        updatedData[destKey] = sheet.data[srcKey];
      }
    }
  });
  return updatedData;
}

/** Remove as linhas [start, end] deslocando as de baixo. */
export function deleteRowsData(sheet: Sheet, start: number, end: number): { data: { [key: string]: CellData }; rowCount: number } {
  const countToDelete = end - start + 1;
  const data: { [key: string]: CellData } = {};
  const columns = dataColumns(sheet);
  for (let r = 0; r < sheet.rowCount; r++) {
    if (r >= start && r <= end) continue;
    const targetR = r > end ? r - countToDelete : r;
    for (const c of columns) {
      const src = sheet.data[cellPosToKey(r, c)];
      if (src) data[cellPosToKey(targetR, c)] = src;
    }
  }
  return { data, rowCount: Math.max(10, sheet.rowCount - countToDelete) };
}
