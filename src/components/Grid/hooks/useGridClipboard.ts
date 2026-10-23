// src/components/Grid/hooks/useGridClipboard.ts
// Copiar, recortar e colar (interno, texto e tabelas HTML) da grade.

import { useState } from 'react';
import { CellData, CellPosition, CellRange, Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, recalculateSheet, shiftFormula } from '../../../engine/formulaParser';
import { applyHtmlTable, parseHtmlTable } from '../../../utils/htmlTablePaste';

export interface GridClipboard {
  range: CellRange;
  data: { [relKey: string]: CellData };
  isCut: boolean;
}

export function useGridClipboard(params: {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  onUpdateSheet: (sheet: Sheet) => void;
}) {
  const { sheet, activeCell, selectedRange, onUpdateSheet } = params;
  const [clipboard, setClipboard] = useState<GridClipboard | null>(null);

  /** Cola uma tabela HTML (Excel, Sheets, páginas web) da área de transferência do sistema, se houver. */
  const tryPasteHtml = async (): Promise<boolean> => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return false;
    try {
      for (const item of await navigator.clipboard.read()) {
        if (!item.types.includes('text/html')) continue;
        const table = parseHtmlTable(await (await item.getType('text/html')).text());
        if (!table) continue;
        const pasted = applyHtmlTable(sheet.data, table, activeCell.row, activeCell.col, sheet, sheet.mergedRegions);
        onUpdateSheet(recalculateSheet({ ...sheet, data: pasted.data, mergedRegions: pasted.mergedRegions }));
        return true;
      }
    } catch {
      // sem permissão ou formato indisponível: segue para o texto simples
    }
    return false;
  };

  // Copy selection to internal & native clipboard (CTRL+C)
  const handleCopySelection = (isCut = false) => {
    const clipData: { [relKey: string]: CellData } = {};
    const textRows: string[] = [];

    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      const rowVals: string[] = [];
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        const key = cellPosToKey(r, c);
        const cell = sheet.data[key];
        const relR = r - selectedRange.startRow;
        const relC = c - selectedRange.startCol;
        const relKey = `${relR},${relC}`;

        if (cell) {
          clipData[relKey] = JSON.parse(JSON.stringify(cell));
          rowVals.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : cell.raw);
        } else {
          rowVals.push('');
        }
      }
      textRows.push(rowVals.join('\t'));
    }

    setClipboard({
      range: { ...selectedRange },
      data: clipData,
      isCut,
    });

    // Copy to system clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textRows.join('\n')).catch(() => {});
    }
  };

  // Paste from clipboard (CTRL+V) with relative formula adjusting
  const handlePasteSelection = async () => {
    const updatedData = { ...sheet.data };
    const destRow = activeCell.row;
    const destCol = activeCell.col;

    if (clipboard && Object.keys(clipboard.data).length > 0) {
      const deltaR = destRow - clipboard.range.startRow;
      const deltaC = destCol - clipboard.range.startCol;

      for (const [relKey, cell] of Object.entries(clipboard.data)) {
        const [relRStr, relCStr] = relKey.split(',');
        const r = destRow + parseInt(relRStr, 10);
        const c = destCol + parseInt(relCStr, 10);

        if (r < sheet.rowCount && c < sheet.colCount) {
          let newRaw = cell.raw;
          // Adjust formula references if it's a formula and not a cut
          if (newRaw.startsWith('=') && !clipboard.isCut) {
            newRaw = shiftFormula(newRaw, deltaR, deltaC);
          }

          updatedData[cellPosToKey(r, c)] = {
            raw: newRaw,
            value: newRaw.startsWith('=') ? null : newRaw,
            format: cell.format ? { ...cell.format } : undefined,
          };
        }
      }

      // If cut mode, clear source cells
      if (clipboard.isCut) {
        for (let r = clipboard.range.startRow; r <= clipboard.range.endRow; r++) {
          for (let c = clipboard.range.startCol; c <= clipboard.range.endCol; c++) {
            if (!(r >= destRow && r < destRow + (clipboard.range.endRow - clipboard.range.startRow + 1) &&
                  c >= destCol && c < destCol + (clipboard.range.endCol - clipboard.range.startCol + 1))) {
              delete updatedData[cellPosToKey(r, c)];
            }
          }
        }
        setClipboard(null);
      }

      const recalculated = recalculateSheet({ ...sheet, data: updatedData });
      onUpdateSheet(recalculated);
    } else if (await tryPasteHtml()) {
      return;
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      // Fallback: paste from OS clipboard
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          const lines = clipText.split(/\r\n|\r|\n/);
          lines.forEach((line, rOffset) => {
            const cols = line.split('\t');
            cols.forEach((val, cOffset) => {
              const r = destRow + rOffset;
              const c = destCol + cOffset;
              if (r < sheet.rowCount && c < sheet.colCount) {
                updatedData[cellPosToKey(r, c)] = {
                  raw: val,
                  value: val.startsWith('=') ? null : val,
                };
              }
            });
          });
          const recalculated = recalculateSheet({ ...sheet, data: updatedData });
          onUpdateSheet(recalculated);
        }
      } catch {
        // clipboard access denied
      }
    }
  };

  return { clipboard, setClipboard, handleCopySelection, handlePasteSelection };
}
