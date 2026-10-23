// src/engine/recalc/legacyRecalc.ts
// Recálculo por VARREDURA (até 3 passagens sobre todas as células). Caminho antigo, mantido atrás de
// flag (ver engineFlag.ts) para comparação e rollback. O motor padrão usa o grafo de dependências.

import { Sheet } from '../../types/spreadsheet';
import { evaluateFormula } from '../formulas/evaluator';
import { cellPosToKey, parseCellAddress } from '../formulas/addressing';

export function recalculateSheetLegacy(sheet: Sheet, allSheets: Sheet[] = [sheet]): Sheet {
  const updatedData = { ...sheet.data };
  const workingSheet: Sheet = { ...sheet, data: updatedData };
  const updatedAllSheets = allSheets.map(s => (s.id === sheet.id ? workingSheet : s));

  // 1. Clear previous spill cells so they can be freshly re-evaluated
  for (const [key, cell] of Object.entries(updatedData)) {
    if (cell.isSpill) {
      delete updatedData[key];
    }
  }

  // 2. Multi-pass calculation
  for (let pass = 0; pass < 3; pass++) {
    let hasChanges = false;
    for (const [key, cell] of Object.entries(updatedData)) {
      if (cell.raw && typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
        try {
          const val = evaluateFormula(cell.raw, workingSheet, updatedAllSheets);

          // Check if result is a 2D Matrix / Dynamic Array
          if (Array.isArray(val) && val.length > 0) {
            const matrix: any[][] = Array.isArray(val[0]) ? val : val.map(item => [item]);
            const numRows = matrix.length;
            const numCols = matrix[0]?.length || 1;

            const posMatch = key.match(/^R(\d+)C(\d+)$/);
            const pos = posMatch
              ? { row: parseInt(posMatch[1], 10), col: parseInt(posMatch[2], 10) }
              : parseCellAddress(key);
            if (pos && (numRows > 1 || numCols > 1)) {
              // Collision detection in spill range
              let hasCollision = false;
              for (let r = 0; r < numRows; r++) {
                for (let c = 0; c < numCols; c++) {
                  if (r === 0 && c === 0) continue;
                  const targetKey = cellPosToKey(pos.row + r, pos.col + c);
                  const existing = updatedData[targetKey];
                  if (existing && existing.raw && !existing.isSpill && existing.raw !== '') {
                    hasCollision = true;
                    break;
                  }
                }
                if (hasCollision) break;
              }

              if (hasCollision) {
                updatedData[key] = {
                  ...cell,
                  value: '#DESPEJAR!',
                  error: '#DESPEJAR!',
                  spillRange: {
                    startRow: pos.row,
                    startCol: pos.col,
                    endRow: pos.row + numRows - 1,
                    endCol: pos.col + numCols - 1,
                  },
                };
              } else {
                // Populate origin cell
                updatedData[key] = {
                  ...cell,
                  value: matrix[0][0],
                  error: null,
                  spillRange: {
                    startRow: pos.row,
                    startCol: pos.col,
                    endRow: pos.row + numRows - 1,
                    endCol: pos.col + numCols - 1,
                  },
                };

                // Populate spilled cells
                for (let r = 0; r < numRows; r++) {
                  for (let c = 0; c < numCols; c++) {
                    if (r === 0 && c === 0) continue;
                    const targetKey = cellPosToKey(pos.row + r, pos.col + c);
                    updatedData[targetKey] = {
                      raw: '',
                      value: matrix[r][c],
                      isSpill: true,
                      spillParent: key,
                    };
                  }
                }
              }
            } else {
              const scalar = Array.isArray(val[0]) ? val[0][0] : val[0];
              updatedData[key] = {
                ...cell,
                value: scalar,
                error: null,
                spillRange: undefined,
              };
            }
          } else {
            if (updatedData[key]?.value !== val) {
              hasChanges = true;
              updatedData[key] = {
                ...cell,
                value: val,
                error: typeof val === 'string' && val.startsWith('#') ? val : null,
                spillRange: undefined,
              };
            }
          }
        } catch (err: any) {
          updatedData[key] = {
            ...cell,
            value: '#ERRO!',
            error: err.message || '#ERRO!',
            spillRange: undefined,
          };
        }
      }
    }
    if (!hasChanges) break;
  }
  return { ...sheet, data: updatedData };
}
