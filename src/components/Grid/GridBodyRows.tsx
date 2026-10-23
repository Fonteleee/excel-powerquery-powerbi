// src/components/Grid/GridBodyRows.tsx
// Linhas visíveis da grade (janela virtual): cabeçalho de linha e células.

import React from 'react';
import { CellPosition, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToKey } from '../../engine/formulaParser';
import { FormulaCellHighlightInfo, GridCell } from './GridCell';

export interface GridBodyRowsProps {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  renderedCols: number;
  rowIndices: number[];
  isEditing: boolean;
  editValue: string;
  multiSelectedKeys: Set<string>;
  formulaHighlights: { range: CellRange; color: string; bgColor: string }[];
  columnValueMap: Record<number, any[]>;
  setEditValue: (value: string) => void;
  startEditing: (initial?: string) => void;
  commitEdit: () => void;
  setIsEditing: (value: boolean) => void;
  onSelectCell: (pos: CellPosition) => void;
  onSelectRange: (range: CellRange) => void;
  handleRowHeaderMouseDown: (e: React.MouseEvent, row: number) => void;
  handleRowHeaderMouseEnter: (e: React.MouseEvent, row: number) => void;
  handleRowResizeMouseDown: (e: React.MouseEvent, row: number) => void;
  handleCellMouseDown: (e: React.MouseEvent, row: number, col: number) => void;
  handleCellMouseEnter: (e: React.MouseEvent, row: number, col: number) => void;
  handleFillMouseDown: (e: React.MouseEvent) => void;
  handleFillDoubleClick: (row: number, col: number) => void;
}

export function GridBodyRows(props: GridBodyRowsProps) {
  const {
    sheet, activeCell, selectedRange, renderedCols, rowIndices, isEditing, editValue, multiSelectedKeys,
    formulaHighlights, columnValueMap, setEditValue, startEditing, commitEdit, setIsEditing, onSelectCell,
    onSelectRange, handleRowHeaderMouseDown, handleRowHeaderMouseEnter, handleRowResizeMouseDown,
    handleCellMouseDown, handleCellMouseEnter, handleFillMouseDown, handleFillDoubleClick,
  } = props;
  return (
    <>
          {rowIndices.map(rowIdx => {
            const isRowSelected =
              rowIdx >= selectedRange.startRow && rowIdx <= selectedRange.endRow;
            const isRowActive = rowIdx === activeCell.row;
            const height = sheet.rowHeights[rowIdx] || 26;

            return (
              <tr key={rowIdx} style={{ height: `${height}px` }}>
                {/* Sticky Row Number (Left column) - NocoDB # Column */}
                <th
                  className={`sticky left-0 z-10 w-10 border-r border-b border-[#e2e8f0] text-xs font-mono select-none transition-colors cursor-pointer text-center ${
                    isRowSelected || isRowActive
                      ? 'bg-indigo-50 text-indigo-950 font-bold border-r-2 border-r-indigo-600'
                      : 'bg-[#f8fafc] text-slate-700 font-bold hover:bg-slate-100'
                  }`}
                  onMouseDown={e => handleRowHeaderMouseDown(e, rowIdx)}
                  onMouseEnter={e => handleRowHeaderMouseEnter(e, rowIdx)}
                >
                  <div className="relative h-full flex items-center justify-center font-mono text-xs font-bold">
                    {rowIdx + 1}
                    <div
                      onMouseDown={e => handleRowResizeMouseDown(e, rowIdx)}
                      className="absolute bottom-0 left-0 right-0 h-1.5 hover:bg-indigo-500 cursor-row-resize z-20"
                    />
                  </div>
                </th>

                {/* Cells in row */}
                {Array.from({ length: renderedCols }).map((_, colIdx) => {

                  const key = cellPosToKey(rowIdx, colIdx);
                  const cell = sheet.data[key];

                  const isCellSelected =
                    activeCell.row === rowIdx && activeCell.col === colIdx;
                  const isCellInRange =
                    rowIdx >= selectedRange.startRow &&
                    rowIdx <= selectedRange.endRow &&
                    colIdx >= selectedRange.startCol &&
                    colIdx <= selectedRange.endCol;

                  const isCellEditing = isEditing && isCellSelected;

                  const merged = sheet.mergedRegions.find(
                    m => m.startRow === rowIdx && m.startCol === colIdx
                  );
                  const isCovered = sheet.mergedRegions.some(
                    m =>
                      rowIdx >= m.startRow &&
                      rowIdx <= m.endRow &&
                      colIdx >= m.startCol &&
                      colIdx <= m.endCol &&
                      !(m.startRow === rowIdx && m.startCol === colIdx)
                  );

                  const isSingleCell =
                    selectedRange.startRow === selectedRange.endRow &&
                    selectedRange.startCol === selectedRange.endCol;

                  // Check if this cell is part of any formula argument highlighted reference (Excel Arg Highlighting)
                  let cellFormulaHighlight: FormulaCellHighlightInfo | undefined = undefined;
                  if (formulaHighlights.length > 0) {
                    for (const fh of formulaHighlights) {
                      const { startRow, startCol, endRow, endCol } = fh.range;
                      if (rowIdx >= startRow && rowIdx <= endRow && colIdx >= startCol && colIdx <= endCol) {
                        cellFormulaHighlight = {
                          color: fh.color,
                          bgColor: fh.bgColor,
                          isTop: rowIdx === startRow,
                          isBottom: rowIdx === endRow,
                          isLeft: colIdx === startCol,
                          isRight: colIdx === endCol,
                        };
                        break;
                      }
                    }
                  }

                  return (
                    <GridCell
                      key={colIdx}
                      row={rowIdx}
                      col={colIdx}
                      cell={cell}
                      isSelected={isCellSelected}
                      isInRange={isCellInRange}
                      isMultiSelected={multiSelectedKeys.has(key)}
                      isSingleCellSelection={isSingleCell}
                      isRangeTop={isCellInRange && rowIdx === selectedRange.startRow}
                      isRangeBottom={isCellInRange && rowIdx === selectedRange.endRow}
                      isRangeLeft={isCellInRange && colIdx === selectedRange.startCol}
                      isRangeRight={isCellInRange && colIdx === selectedRange.endCol}
                      isRangeBottomRight={isCellInRange && rowIdx === selectedRange.endRow && colIdx === selectedRange.endCol}
                      formulaHighlight={cellFormulaHighlight}
                      isEditing={isCellEditing}
                      editValue={editValue}
                      mergedRegion={merged}
                      isMergeCovered={isCovered}
                      conditionalRules={sheet.conditionalRules}
                      allColumnValues={columnValueMap[colIdx] || []}


                      onMouseDown={handleCellMouseDown}
                      onMouseEnter={handleCellMouseEnter}
                      onDoubleClick={() => startEditing()}
                      onEditChange={setEditValue}
                      onEditKeyDown={e => {
                        if (e.key === 'Enter') {
                          commitEdit();
                          onSelectCell({ row: rowIdx + 1, col: colIdx });
                          onSelectRange({
                            startRow: rowIdx + 1,
                            startCol: colIdx,
                            endRow: rowIdx + 1,
                            endCol: colIdx,
                          });
                        } else if (e.key === 'Escape') {
                          setIsEditing(false);
                        } else if (e.key === 'Tab') {
                          commitEdit();
                          onSelectCell({ row: rowIdx, col: colIdx + 1 });
                          onSelectRange({
                            startRow: rowIdx,
                            startCol: colIdx + 1,
                            endRow: rowIdx,
                            endCol: colIdx + 1,
                          });
                        }
                      }}
                      onEditBlur={commitEdit}
                      onFillMouseDown={handleFillMouseDown}
                      onFillDoubleClick={handleFillDoubleClick}
                    />
                  );
                })}
              </tr>
            );
          })}
    </>
  );
}
