import { atom } from 'jotai';
import { CellData, CellPosition, CellRange, Sheet } from '../types/spreadsheet';

export const activeCellAtom = atom<CellPosition>({ row: 0, col: 0 });
export const selectedRangeAtom = atom<CellRange>({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
export const selectionAnchorAtom = atom<CellPosition>({ row: 0, col: 0 });
export const isSelectingAtom = atom<boolean>(false);
export const multiSelectedKeysAtom = atom<Set<string>>(new Set<string>());

// Base sheets config (without data to prevent huge re-renders)
export const sheetsAtom = atom<Omit<Sheet, 'data'>[]>([]);
export const activeSheetIdAtom = atom<string>('Sheet1');

// Cell data atoms mapped by sheetId + '_' + cellKey
export const cellDataMapAtom = atom<Record<string, CellData>>({});

// Derived atom for the current sheet
export const currentSheetAtom = atom(
  (get) => {
    const sheets = get(sheetsAtom);
    const activeId = get(activeSheetIdAtom);
    const sheetConfig = sheets.find(s => s.id === activeId) || sheets[0];
    
    // We do not embed the entire data object here to avoid global re-renders.
    // The sheet config just gives rows/cols.
    return sheetConfig;
  }
);
