import React, { useMemo } from 'react';
import { CellData, CellPosition, CellRange, ConditionalFormatRule, MergedRegion } from '../../types/spreadsheet';
import { formatCellValue, parseNumberSafely } from '../../engine/formulaParser';
import { FormulaAutocomplete } from './FormulaAutocomplete';

interface GridCellProps {
  row: number;
  col: number;
  cell?: CellData;
  isSelected: boolean;
  isInRange: boolean;
  isMultiSelected?: boolean;
  isSingleCellSelection?: boolean;
  isRangeTop?: boolean;
  isRangeBottom?: boolean;
  isRangeLeft?: boolean;
  isRangeRight?: boolean;
  isRangeBottomRight?: boolean;
  isEditing: boolean;
  editValue: string;
  mergedRegion?: MergedRegion;
  isMergeCovered?: boolean;
  conditionalRules: ConditionalFormatRule[];
  allColumnValues?: any[];
  onMouseDown: (e: React.MouseEvent, row: number, col: number) => void;
  onMouseEnter: (e: React.MouseEvent, row: number, col: number) => void;
  onDoubleClick: (row: number, col: number) => void;
  onEditChange: (value: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditBlur: () => void;
  onFillMouseDown?: (e: React.MouseEvent) => void;
  onFillDoubleClick?: (row: number, col: number) => void;
}

const GridCellComponent: React.FC<GridCellProps> = ({
  row,
  col,
  cell,
  isSelected,
  isInRange,
  isMultiSelected = false,
  isSingleCellSelection = true,
  isRangeTop = false,
  isRangeBottom = false,
  isRangeLeft = false,
  isRangeRight = false,
  isRangeBottomRight = false,
  isEditing,
  editValue,
  mergedRegion,
  isMergeCovered,
  conditionalRules,
  allColumnValues = [],
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onFillMouseDown,
  onFillDoubleClick,
}) => {
  if (isMergeCovered) return null;

  const rawValue = cell?.raw ?? '';
  const cellVal = cell?.value !== undefined ? cell.value : rawValue;
  const displayFormatted = formatCellValue(cellVal, cell?.format);

  const interpolateHexColor = (color1: string, color2: string, factor: number): string => {
    const parseHex = (hex: string) => {
      let clean = hex.replace('#', '');
      if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
      const num = parseInt(clean, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    try {
      const c1 = parseHex(color1);
      const c2 = parseHex(color2);
      const r = Math.round(c1[0] + factor * (c2[0] - c1[0]));
      const g = Math.round(c1[1] + factor * (c2[1] - c1[1]));
      const b = Math.round(c1[2] + factor * (c2[2] - c1[2]));
      return `rgb(${r}, ${g}, ${b})`;
    } catch {
      return color1;
    }
  };

  const matchedRule = useMemo(() => {
    for (const rule of conditionalRules) {
      if (
        row >= rule.range.startRow &&
        row <= rule.range.endRow &&
        col >= rule.range.startCol &&
        col <= rule.range.endCol
      ) {
        const numVal = parseNumberSafely(cellVal);
        const v1 = parseNumberSafely(rule.value1) ?? rule.value1;
        const v2 = parseNumberSafely(rule.value2) ?? rule.value2;

        if (rule.type === 'data_bar' && numVal !== null) return rule;
        if (rule.type === 'color_scale_3' && numVal !== null) return rule;
        if (rule.type === 'icon_set' && numVal !== null) return rule;
        if (rule.type === 'highlight_greater' && numVal !== null && typeof v1 === 'number' && numVal > v1) return rule;
        if (rule.type === 'highlight_less' && numVal !== null && typeof v1 === 'number' && numVal < v1) return rule;
        if (rule.type === 'highlight_between' && numVal !== null && typeof v1 === 'number' && typeof v2 === 'number' && numVal >= v1 && numVal <= v2) return rule;
        if (rule.type === 'highlight_equal' && String(cellVal).toLowerCase() === String(v1).toLowerCase()) return rule;
        if (rule.type === 'highlight_text' && String(cellVal).toLowerCase().includes(String(v1).toLowerCase())) return rule;
        if (rule.type === 'highlight_above_avg' && numVal !== null) {
          const numList = allColumnValues.map(v => parseNumberSafely(v)).filter((n): n is number => n !== null);
          const avg = numList.length > 0 ? numList.reduce((a, b) => a + b, 0) / numList.length : 0;
          if (numVal > avg) return rule;
        }
      }
    }
    return null;
  }, [conditionalRules, row, col, cellVal, allColumnValues]);


  // Compute Data Bar percentage if matched
  const dataBarPercent = useMemo(() => {
    if (matchedRule?.type === 'data_bar') {
      const numVal = parseNumberSafely(cellVal, true);
      if (numVal === null) return 0;
      const numList = allColumnValues
        .map(v => parseNumberSafely(v, true))
        .filter((n): n is number => n !== null);
      if (numList.length === 0) return 0;
      const max = Math.max(...numList, 1);
      const min = Math.min(...numList, 0);
      return Math.min(Math.max(((numVal - min) / (max - min || 1)) * 100, 2), 100);
    }
    return 0;
  }, [matchedRule, cellVal, allColumnValues]);

  // Compute 3-Color Scale background if matched
  const colorScaleBg = useMemo(() => {
    if (matchedRule?.type === 'color_scale_3') {
      const numVal = parseNumberSafely(cellVal, true);
      if (numVal === null) return null;
      const numList = allColumnValues
        .map(v => parseNumberSafely(v, true))
        .filter((n): n is number => n !== null);
      if (numList.length === 0) return null;
      const min = Math.min(...numList);
      const max = Math.max(...numList);
      if (max === min) return matchedRule.style.midColor || '#fef08a';

      const ratio = Math.min(Math.max((numVal - min) / (max - min || 1), 0), 1);
      const minCol = matchedRule.style.minColor || '#fecaca'; // red
      const midCol = matchedRule.style.midColor || '#fef08a'; // yellow
      const maxCol = matchedRule.style.maxColor || '#bbf7d0'; // green

      if (ratio < 0.5) {
        return interpolateHexColor(minCol, midCol, ratio * 2);
      } else {
        return interpolateHexColor(midCol, maxCol, (ratio - 0.5) * 2);
      }
    }
    return null;
  }, [matchedRule, cellVal, allColumnValues]);



  // Styles
  const fmt = cell?.format;
  const hasDarkBg = (fmt?.bgColor && fmt.bgColor !== '#ffffff' && fmt.bgColor !== 'transparent' && fmt.bgColor !== '#f8fafc' && fmt.bgColor !== '#f1f5f9') || Boolean(matchedRule?.style.bgColor);

  let effectiveTextColor = matchedRule?.style.textColor || fmt?.textColor || '#0f172a';
  let effectiveBgColor = colorScaleBg || matchedRule?.style.bgColor || fmt?.bgColor || '#ffffff';

  // If text was set to white (#ffffff) but cell has no dark background
  if ((effectiveTextColor.toLowerCase() === '#ffffff' || effectiveTextColor.toLowerCase() === '#fff' || effectiveTextColor === 'white') && !hasDarkBg && !colorScaleBg) {
    effectiveTextColor = '#0f172a';
  }

  const cellStyle: React.CSSProperties = {
    fontWeight: fmt?.bold ? 700 : 400,
    fontStyle: fmt?.italic ? 'italic' : 'normal',
    textDecoration: `${fmt?.underline ? 'underline' : ''} ${fmt?.strike ? 'line-through' : ''}`.trim() || 'none',
    color: effectiveTextColor,
    backgroundColor: effectiveBgColor,
    fontSize: fmt?.fontSize ? `${fmt.fontSize}px` : undefined,
    textAlign: fmt?.align || (typeof cellVal === 'number' ? 'right' : 'left'),
  };


  // Borders
  if (fmt?.border) {
    if (fmt.border.top) cellStyle.borderTop = `1px solid ${fmt.border.color || '#cbd5e1'}`;
    if (fmt.border.bottom) cellStyle.borderBottom = `1px solid ${fmt.border.color || '#cbd5e1'}`;
    if (fmt.border.left) cellStyle.borderLeft = `1px solid ${fmt.border.color || '#cbd5e1'}`;
    if (fmt.border.right) cellStyle.borderRight = `1px solid ${fmt.border.color || '#cbd5e1'}`;
  }

  const isError = typeof cellVal === 'string' && cellVal.startsWith('#');

  // Merged spanning
  const colSpan = mergedRegion ? mergedRegion.endCol - mergedRegion.startCol + 1 : 1;
  const rowSpan = mergedRegion ? mergedRegion.endRow - mergedRegion.startRow + 1 : 1;

  // Perimeter border style when inside a multi-cell selected range (Excel Online Style)
  const rangeBorders: React.CSSProperties = {};
  if (isInRange && !isSingleCellSelection) {
    if (isRangeTop) {
      rangeBorders.borderTop = '2px solid #107c41';
    }
    if (isRangeBottom) {
      rangeBorders.borderBottom = '2px solid #107c41';
    }
    if (isRangeLeft) {
      rangeBorders.borderLeft = '2px solid #107c41';
    }
    if (isRangeRight) {
      rangeBorders.borderRight = '2px solid #107c41';
    }
  }

  const mergedStyle: React.CSSProperties = {
    ...cellStyle,
    ...rangeBorders,
  };

  // Compute unified selection class
  let selectionClass = '';
  if (isEditing) {
    selectionClass = 'cell-highlight-edit';
  } else if (isSingleCellSelection && isSelected) {
    selectionClass = 'cell-selected-single';
  } else if (isInRange) {
    selectionClass = isSelected ? 'cell-range-anchor' : 'cell-in-range';
  } else if (isMultiSelected) {
    selectionClass = isSelected ? 'cell-selected-single' : 'cell-multi-selected';
  } else {
    selectionClass = 'hover:bg-[#f3f2f1]/60 bg-white';
  }

  return (
    <td
      data-cell={`R${row}C${col}`}
      colSpan={colSpan > 1 ? colSpan : undefined}
      rowSpan={rowSpan > 1 ? rowSpan : undefined}
      onMouseDown={e => onMouseDown(e, row, col)}
      onMouseEnter={e => onMouseEnter(e, row, col)}
      onDoubleClick={() => onDoubleClick(row, col)}
      style={mergedStyle}
      className={`relative px-1.5 py-0.5 text-xs font-sans border-r border-b border-[#e1dfdd] transition-colors select-none overflow-visible ${selectionClass} ${
        isError ? 'text-rose-600 font-semibold bg-rose-50' : ''
      }`}
    >
      {/* Excel Online Autofill Corner Handle Pip (Only on single cell or bottom-right of range) */}
      {!isEditing && (
        (isSingleCellSelection && isSelected) ||
        (!isSingleCellSelection && isRangeBottomRight)
      ) && (
        <div
          title="Alça de Preenchimento: Arraste ou clique duas vezes para preencher"
          onMouseDown={e => {
            e.stopPropagation();
            if (onFillMouseDown) onFillMouseDown(e);
          }}
          onDoubleClick={e => {
            e.stopPropagation();
            if (onFillDoubleClick) onFillDoubleClick(row, col);
          }}
          className="absolute -bottom-1 -right-1 size-2 bg-[#107c41] border border-white z-30 cursor-crosshair shadow-xs hover:scale-125 transition-transform"
        />
      )}

      {/* Data Bar background fill */}
      {dataBarPercent > 0 && (
        <div
          className="absolute inset-y-0.5 left-0 rounded-xs pointer-events-none opacity-30 transition-all duration-300"
          style={{
            width: `${dataBarPercent}%`,
            backgroundColor: matchedRule?.style.barColor || '#107c41',
          }}
        />
      )}

      {/* Traffic light icon if matched */}
      {matchedRule?.type === 'icon_set' && (
        <span className="inline-block size-2 rounded-full mr-1.5 align-middle bg-[#107c41] shadow-2xs" />
      )}

      {/* Editing Input with Autocomplete */}
      {isEditing ? (
        <div className="absolute inset-0 z-30">
          <input
            ref={(el) => {
              if (el && document.activeElement !== el) {
                el.focus();
                const len = el.value.length;
                el.setSelectionRange(len, len);
              }
            }}
            type="text"
            value={editValue}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={onEditBlur}
            className="w-full h-full px-1.5 bg-white text-[#201f1e] text-xs font-sans border-2 border-[#107c41] focus:outline-hidden shadow-md"
          />
          {editValue.startsWith('=') && (
            <FormulaAutocomplete
              input={editValue}
              onSelectFormula={onEditChange}
              className="left-0 top-full"
            />
          )}
        </div>
      ) : (
        <div className={`relative z-1 truncate w-full flex items-center ${
          cellStyle.textAlign === 'center' ? 'justify-center' : cellStyle.textAlign === 'right' ? 'justify-end' : 'justify-start'
        }`}>
          <span className={`truncate ${typeof cellVal === 'number' || /^\d{2}:\d{2}/.test(String(cellVal)) ? 'font-mono tabular-nums' : 'font-sans'}`}>
            {displayFormatted}
          </span>
        </div>
      )}
    </td>
  );
};




export const GridCell = React.memo(GridCellComponent, (prev, next) => {
  return (
    prev.row === next.row &&
    prev.col === next.col &&
    prev.isSelected === next.isSelected &&
    prev.isInRange === next.isInRange &&
    prev.isMultiSelected === next.isMultiSelected &&
    prev.isSingleCellSelection === next.isSingleCellSelection &&
    prev.isRangeTop === next.isRangeTop &&
    prev.isRangeBottom === next.isRangeBottom &&
    prev.isRangeLeft === next.isRangeLeft &&
    prev.isRangeRight === next.isRangeRight &&
    prev.isRangeBottomRight === next.isRangeBottomRight &&
    prev.isEditing === next.isEditing &&
    prev.editValue === next.editValue &&
    prev.isMergeCovered === next.isMergeCovered &&
    prev.cell?.raw === next.cell?.raw &&
    prev.cell?.value === next.cell?.value &&
    prev.cell?.format === next.cell?.format &&
    prev.conditionalRules === next.conditionalRules
  );
});



