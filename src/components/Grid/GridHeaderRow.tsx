// src/components/Grid/GridHeaderRow.tsx
// Cabeçalho da grade: canto "#" e cabeçalhos de coluna (tipo, filtro, redimensionar).

import React from 'react';
import { ChevronDown, Filter as FilterIcon } from 'lucide-react';
import { CellPosition, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel } from '../../engine/formulaParser';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { getNocoColumnIcon } from './columnMeta';
import { ColWindow } from './colWindow';
import { FrozenLayout } from './freeze';

export interface GridHeaderRowProps {
  sheet: Sheet;
  activeCell: CellPosition;
  selectedRange: CellRange;
  colWindow: ColWindow;
  frozen: FrozenLayout;
  /** Botões +/− de grupo de colunas: coluna -> recolhido? */
  colToggles: Map<number, boolean>;
  onToggleColGroup: (col: number) => void;
  openFilterCol: number | null;
  setOpenFilterCol: (col: number | null) => void;
  onSelectAll: () => void;
  handleColHeaderMouseDown: (e: React.MouseEvent, col: number) => void;
  handleColHeaderMouseEnter: (e: React.MouseEvent, col: number) => void;
  handleColResizeMouseDown: (e: React.MouseEvent, col: number) => void;
  handleColAutoFit: (col: number) => void;
  handleApplyColumnFilter: (col: number, values: string[] | null) => void;
  handleSortColumn: (col: number, direction: 'asc' | 'desc') => void;
}

export function GridHeaderRow(props: GridHeaderRowProps) {
  const {
    sheet, activeCell, selectedRange, colWindow, frozen, colToggles, onToggleColGroup, openFilterCol, setOpenFilterCol, onSelectAll,
    handleColHeaderMouseDown, handleColHeaderMouseEnter, handleColResizeMouseDown, handleColAutoFit,
    handleApplyColumnFilter, handleSortColumn,
  } = props;
  const windowCols = Array.from({ length: colWindow.end - colWindow.start + 1 }, (_, i) => colWindow.start + i);
  const renderHeader = (colIdx: number) => {
    if (sheet.hiddenCols?.includes(colIdx)) return null;
              const colLabel = colIndexToLabel(colIdx);
              const isColSelected =
                colIdx >= selectedRange.startCol && colIdx <= selectedRange.endCol;
              const isColActive = colIdx === activeCell.col;
              const width = sheet.colWidths[colIdx] || 120;
              const isColFiltered = Boolean(sheet.filters?.[colIdx]);
              const headerCell = sheet.data[cellPosToKey(0, colIdx)];
              const colHeaderTitle = headerCell?.value || colLabel;
              const colMeta = getNocoColumnIcon(sheet, colIdx);

              return (
                <th
                  key={colIdx}
                  title={`Coluna ${colLabel}: ${colHeaderTitle}`}
                  style={{
                    width: `${width}px`,
                    minWidth: `${width}px`,
                    maxWidth: `${width}px`,
                    ...(frozen.colLeft(colIdx) !== undefined ? { position: 'sticky', left: frozen.colLeft(colIdx), zIndex: 25 } : {}),
                  }}
                  className={`relative h-8 border-r border-b border-[#e2e8f0] text-xs font-sans font-semibold transition-colors cursor-pointer select-none group ${
                    isColSelected || isColActive
                      ? 'bg-indigo-50 text-indigo-950 font-bold'
                      : 'bg-[#f8fafc] text-slate-800 hover:bg-slate-100'
                  }`}
                  onMouseDown={e => handleColHeaderMouseDown(e, colIdx)}
                  onMouseEnter={e => handleColHeaderMouseEnter(e, colIdx)}
                >
                  <div className="flex items-center justify-between px-2 font-sans relative w-full h-full">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-4 rounded flex items-center justify-center shrink-0 ${colMeta.bg}`} title={`Tipo: ${colMeta.label}`}>
                        {colMeta.icon}
                      </span>
                      <span className="truncate text-xs text-slate-700 font-bold group-hover:text-slate-950">
                        {colLabel}
                      </span>
                    </div>

                    {colToggles.has(colIdx) && (
                      <button
                        type="button"
                        title={colToggles.get(colIdx) ? 'Expandir grupo' : 'Recolher grupo'}
                        aria-label={colToggles.get(colIdx) ? 'Expandir grupo de colunas' : 'Recolher grupo de colunas'}
                        aria-expanded={!colToggles.get(colIdx)}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          onToggleColGroup(colIdx);
                        }}
                        className="size-3.5 rounded-xs border border-slate-400 bg-white text-[10px] leading-none text-slate-700 hover:bg-indigo-50 cursor-pointer shrink-0"
                      >
                        {colToggles.get(colIdx) ? '+' : '−'}
                      </button>
                    )}
                    <ChevronDown className="size-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

                    {/* Filter Button */}
                    {sheet.filterEnabled && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setOpenFilterCol(openFilterCol === colIdx ? null : colIdx);
                        }}
                        title={`Filtrar / Classificar Coluna ${colLabel}`}
                        className={`absolute right-1 p-0.5 rounded transition-all cursor-pointer ${
                          isColFiltered
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-200'
                        }`}
                      >
                        <FilterIcon className="size-2.5" />
                      </button>
                    )}
                  </div>

                  {/* Column Filter Dropdown */}
                  {openFilterCol === colIdx && (
                    <ColumnFilterDropdown
                      colIndex={colIdx}
                      colName={String(colHeaderTitle)}
                      sheet={sheet}
                      selectedValues={sheet.filters?.[colIdx]}
                      isOpen={true}
                      onClose={() => setOpenFilterCol(null)}
                      onApplyFilter={handleApplyColumnFilter}
                      onSortColumn={handleSortColumn}
                    />
                  )}

                  {/* Column resize drag handle */}
                  <div
                    onMouseDown={e => handleColResizeMouseDown(e, colIdx)}
                    onDoubleClick={() => handleColAutoFit(colIdx)}
                    className="absolute right-0 top-0 bottom-0 w-2 hover:bg-indigo-500 cursor-col-resize z-20 group"
                  >
                    <div className="w-px h-full bg-[#e2e8f0] mx-auto group-hover:bg-indigo-500" />
                  </div>
                </th>
              );
  };

  return (
    <thead className="sticky top-0 z-20 bg-[#f8fafc]">
          <tr>
            {/* Top-left corner origin cell (#) */}
            <th
              title="Selecionar Toda a Tabela (Ctrl+A)"
              onClick={onSelectAll}
              className="sticky left-0 z-30 w-10 h-8 bg-[#f8fafc] border-r border-b border-[#e2e8f0] select-none cursor-pointer hover:bg-slate-100 transition-colors text-center text-slate-700 font-mono text-xs font-bold"
            >
              #
            </th>

            {frozen.extraCols.map(renderHeader)}
            {colWindow.leftPx > 0 && <th aria-hidden style={{ width: colWindow.leftPx, minWidth: colWindow.leftPx, maxWidth: colWindow.leftPx }} className="p-0 border-0" />}
            {windowCols.map(renderHeader)}
            {colWindow.rightPx > 0 && <th aria-hidden style={{ width: colWindow.rightPx, minWidth: colWindow.rightPx, maxWidth: colWindow.rightPx }} className="p-0 border-0" />}
          </tr>
    </thead>
  );
}
