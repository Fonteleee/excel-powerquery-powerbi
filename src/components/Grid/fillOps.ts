// src/components/Grid/fillOps.ts
// Alça de preenchimento (arrastar para baixo/direita): fórmulas deslocadas ou série inteligente. Função pura.

import { CellData, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, parseNumberSafely, shiftFormula } from '../../engine/formulaParser';
import { computeSmartSeries } from '../../engine/autoFillEngine';

/** Devolve o novo mapa de células depois de arrastar a alça de `selectedRange` até `targetRange`. */
export function computeFilledData(sheet: Sheet, selectedRange: CellRange, targetRange: CellRange): { [key: string]: CellData } {
    const updatedData = { ...sheet.data };
    const srcStartR = selectedRange.startRow;
    const srcEndR = selectedRange.endRow;
    const srcStartC = selectedRange.startCol;
    const srcEndC = selectedRange.endCol;
    const srcRowCount = srcEndR - srcStartR + 1;
    const srcColCount = srcEndC - srcStartC + 1;

    // 1. Dragging Downwards
    if (targetRange.endRow > srcEndR) {
      const targetLen = targetRange.endRow - srcEndR;

      for (let c = srcStartC; c <= srcEndC; c++) {
        // Collect source raw values and formats
        const sourceRawVals: string[] = [];
        let hasFormulas = false;

        for (let r = srcStartR; r <= srcEndR; r++) {
          const cell = sheet.data[cellPosToKey(r, c)];
          const raw = cell?.raw || (cell?.value !== null && cell?.value !== undefined ? String(cell.value) : '');
          sourceRawVals.push(raw);
          if (raw.startsWith('=')) hasFormulas = true;
        }

        if (hasFormulas) {
          // Formula Relative Shifting
          for (let r = srcEndR + 1; r <= targetRange.endRow; r++) {
            const sourceRow = srcStartR + ((r - srcEndR - 1) % srcRowCount);
            const sourceCell = sheet.data[cellPosToKey(sourceRow, c)];
            if (sourceCell) {
              const shiftR = r - sourceRow;
              const newRaw = sourceCell.raw.startsWith('=') ? shiftFormula(sourceCell.raw, shiftR, 0) : sourceCell.raw;
              updatedData[cellPosToKey(r, c)] = {
                raw: newRaw,
                value: null,
                format: sourceCell.format ? { ...sourceCell.format } : undefined,
              };
            }
          }
        } else {
          // Smart AutoFill Series (Numbers, Dates, Codes, Days of Week, Months)
          const smartSeries = computeSmartSeries(sourceRawVals, targetLen, 'series');

          smartSeries.forEach((val, idx) => {
            const r = srcEndR + 1 + idx;
            const sourceTemplateCell = sheet.data[cellPosToKey(srcStartR + (idx % srcRowCount), c)];
            updatedData[cellPosToKey(r, c)] = {
              raw: String(val),
              value: typeof val === 'number' ? val : (parseNumberSafely(val) ?? val),
              format: sourceTemplateCell?.format ? { ...sourceTemplateCell.format } : undefined,
            };
          });
        }
      }
    }
    // 2. Dragging to the Right
    else if (targetRange.endCol > srcEndC) {
      const targetLen = targetRange.endCol - srcEndC;

      for (let r = srcStartR; r <= srcEndR; r++) {
        const sourceRawVals: string[] = [];
        let hasFormulas = false;

        for (let c = srcStartC; c <= srcEndC; c++) {
          const cell = sheet.data[cellPosToKey(r, c)];
          const raw = cell?.raw || (cell?.value !== null && cell?.value !== undefined ? String(cell.value) : '');
          sourceRawVals.push(raw);
          if (raw.startsWith('=')) hasFormulas = true;
        }

        if (hasFormulas) {
          for (let c = srcEndC + 1; c <= targetRange.endCol; c++) {
            const sourceCol = srcStartC + ((c - srcEndC - 1) % srcColCount);
            const sourceCell = sheet.data[cellPosToKey(r, sourceCol)];
            if (sourceCell) {
              const shiftC = c - sourceCol;
              const newRaw = sourceCell.raw.startsWith('=') ? shiftFormula(sourceCell.raw, 0, shiftC) : sourceCell.raw;
              updatedData[cellPosToKey(r, c)] = {
                raw: newRaw,
                value: null,
                format: sourceCell.format ? { ...sourceCell.format } : undefined,
              };
            }
          }
        } else {
          const smartSeries = computeSmartSeries(sourceRawVals, targetLen, 'series');
          smartSeries.forEach((val, idx) => {
            const c = srcEndC + 1 + idx;
            const sourceTemplateCell = sheet.data[cellPosToKey(r, srcStartC + (idx % srcColCount))];
            updatedData[cellPosToKey(r, c)] = {
              raw: String(val),
              value: typeof val === 'number' ? val : (parseNumberSafely(val) ?? val),
              format: sourceTemplateCell?.format ? { ...sourceTemplateCell.format } : undefined,
            };
          });
        }
      }
    }
  return updatedData;
}
