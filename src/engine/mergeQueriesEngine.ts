import { Sheet, CellFormat } from '../types/spreadsheet';
import { colIndexToLabel, getCellValue, cellPosToKey, recalculateSheet } from './formulaParser';

export type JoinKind =
  | 'LeftOuter'
  | 'Inner'
  | 'FullOuter'
  | 'RightOuter'
  | 'LeftAnti'
  | 'RightAnti';

export interface JoinKindOption {
  kind: JoinKind;
  label: string;
  description: string;
}

export const JOIN_KIND_OPTIONS: JoinKindOption[] = [
  {
    kind: 'LeftOuter',
    label: 'Externa Esquerda (todas da primeira, correspondentes da segunda)',
    description: 'Mantém todas as linhas da tabela principal e anexa os dados correspondentes da segunda tabela.',
  },
  {
    kind: 'Inner',
    label: 'Interna (apenas linhas correspondentes)',
    description: 'Retorna apenas as linhas onde as chaves existem em ambas as tabelas.',
  },
  {
    kind: 'FullOuter',
    label: 'Externa Completa (todas as linhas de ambas as tabelas)',
    description: 'Retorna todas as linhas de ambas as tabelas, preenchendo com nulo onde não houver correspondência.',
  },
  {
    kind: 'RightOuter',
    label: 'Externa Direita (todas da segunda, correspondentes da primeira)',
    description: 'Mantém todas as linhas da segunda tabela e anexa os dados da primeira.',
  },
  {
    kind: 'LeftAnti',
    label: 'Anti Esquerda (linhas apenas na primeira)',
    description: 'Retorna apenas as linhas da primeira tabela que NÃO possuem correspondência na segunda tabela.',
  },
  {
    kind: 'RightAnti',
    label: 'Anti Direita (linhas apenas na segunda)',
    description: 'Retorna apenas as linhas da segunda tabela que NÃO possuem correspondência na primeira tabela.',
  },
];

export interface MergeQueriesConfig {
  primarySheet: Sheet;

  secondarySheet: Sheet;
  primaryKeyCols: number[]; // Column indices in primary table
  secondaryKeyCols: number[]; // Column indices in secondary table
  joinKind: JoinKind;
  expandedSecondaryCols: number[]; // Secondary table column indices to add to output
  placement?: 'next_to_key' | 'end_of_table';
  usePrefix?: boolean;
  prefixText?: string;
}

export interface MergeQueriesResult {
  sheet: Sheet;
  matchedCount: number;
  totalPrimaryRows: number;
  totalSecondaryRows: number;
  formulaM: string;
}

// Normalize key value for robust case-insensitive and trimmed join comparison
function normalizeKey(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase();
}

export function executeMergeQueries(config: MergeQueriesConfig): MergeQueriesResult {
  const {
    primarySheet,
    secondarySheet,
    primaryKeyCols,
    secondaryKeyCols,
    joinKind,
    expandedSecondaryCols,
    placement = 'next_to_key',
    usePrefix = true,
    prefixText = secondarySheet.name,
  } = config;

  // 1. Find actual used columns and headers
  let effectivePrimaryCols = 0;
  for (let c = 0; c < primarySheet.colCount; c++) {
    const h = getCellValue(primarySheet, 0, c);
    if (h !== null && h !== undefined && String(h).trim() !== '') {
      effectivePrimaryCols = c + 1;
    }
  }
  if (effectivePrimaryCols === 0) effectivePrimaryCols = Math.min(primarySheet.colCount, 26);

  let effectiveSecondaryCols = 0;
  for (let c = 0; c < secondarySheet.colCount; c++) {
    const h = getCellValue(secondarySheet, 0, c);
    if (h !== null && h !== undefined && String(h).trim() !== '') {
      effectiveSecondaryCols = c + 1;
    }
  }
  if (effectiveSecondaryCols === 0) effectiveSecondaryCols = Math.min(secondarySheet.colCount, 26);

  const primaryHeaders: string[] = [];
  for (let c = 0; c < effectivePrimaryCols; c++) {
    const val = getCellValue(primarySheet, 0, c);
    primaryHeaders.push(val !== null && val !== undefined && String(val).trim() !== '' ? String(val).trim() : `Coluna_${colIndexToLabel(c)}`);
  }

  const secondaryHeaders: string[] = [];
  for (let c = 0; c < effectiveSecondaryCols; c++) {
    const val = getCellValue(secondarySheet, 0, c);
    secondaryHeaders.push(val !== null && val !== undefined && String(val).trim() !== '' ? String(val).trim() : `Coluna_${colIndexToLabel(c)}`);
  }

  // 2. Build Secondary Table Hash Map: composite key -> array of row objects
  const secondaryMap = new Map<string, { rowIndex: number; rowValues: any[] }[]>();
  let secondaryFilledRowsCount = 0;

  for (let r = 1; r < secondarySheet.rowCount; r++) {
    let isFilled = false;
    const rowValues: any[] = [];
    for (let c = 0; c < effectiveSecondaryCols; c++) {
      const val = getCellValue(secondarySheet, r, c);
      if (val !== null && val !== undefined && String(val).trim() !== '') isFilled = true;
      rowValues.push(val);
    }
    if (!isFilled) continue;

    secondaryFilledRowsCount++;
    const keyParts = secondaryKeyCols.map(colIdx => normalizeKey(rowValues[colIdx]));
    const compositeKey = keyParts.join('|||');

    if (!secondaryMap.has(compositeKey)) {
      secondaryMap.set(compositeKey, []);
    }
    secondaryMap.get(compositeKey)!.push({ rowIndex: r, rowValues });
  }

  // Placement index (insert right after the primary key, or at the end)
  const insertIndex = placement === 'next_to_key' && primaryKeyCols.length > 0
    ? Math.max(...primaryKeyCols) + 1
    : effectivePrimaryCols;

  // 3. Process Rows based on JoinKind
  const outputRowsData: any[][] = [];
  let matchedCount = 0;
  let primaryFilledRowsCount = 0;
  const matchedSecondaryKeys = new Set<string>();

  const buildRowValues = (primaryRowVals: any[], appendedSecondaryVals: any[]): any[] => {
    if (placement === 'next_to_key') {
      const before = primaryRowVals.slice(0, insertIndex);
      const after = primaryRowVals.slice(insertIndex);
      return [...before, ...appendedSecondaryVals, ...after];
    } else {
      return [...primaryRowVals, ...appendedSecondaryVals];
    }
  };

  // Process Primary Table rows
  for (let r = 1; r < primarySheet.rowCount; r++) {
    let isFilled = false;
    const primaryRowValues: any[] = [];
    for (let c = 0; c < effectivePrimaryCols; c++) {
      const val = getCellValue(primarySheet, r, c);
      if (val !== null && val !== undefined && String(val).trim() !== '') isFilled = true;
      primaryRowValues.push(val);
    }
    if (!isFilled) continue;

    primaryFilledRowsCount++;
    const keyParts = primaryKeyCols.map(colIdx => normalizeKey(primaryRowValues[colIdx]));
    const compositeKey = keyParts.join('|||');
    const matches = secondaryMap.get(compositeKey);

    if (matches && matches.length > 0) {
      matchedCount++;
      matchedSecondaryKeys.add(compositeKey);

      if (joinKind === 'LeftOuter' || joinKind === 'Inner' || joinKind === 'FullOuter') {
        matches.forEach(m => {
          const appendedSecondaryVals = expandedSecondaryCols.map(cIdx => m.rowValues[cIdx] ?? '');
          outputRowsData.push(buildRowValues(primaryRowValues, appendedSecondaryVals));
        });
      }
      // LeftAnti skips matched rows
    } else {
      // No match
      if (joinKind === 'LeftOuter' || joinKind === 'FullOuter' || joinKind === 'LeftAnti') {
        const emptySecondaryVals = expandedSecondaryCols.map(() => '');
        outputRowsData.push(buildRowValues(primaryRowValues, emptySecondaryVals));
      }
    }
  }

  // Process unmatched secondary rows for RightOuter, FullOuter, RightAnti
  if (joinKind === 'RightOuter' || joinKind === 'FullOuter' || joinKind === 'RightAnti') {
    for (const [key, rows] of secondaryMap.entries()) {
      const isMatched = matchedSecondaryKeys.has(key);
      if (!isMatched || joinKind === 'RightOuter' || joinKind === 'FullOuter') {
        if (!isMatched && (joinKind === 'RightOuter' || joinKind === 'FullOuter' || joinKind === 'RightAnti')) {
          rows.forEach(m => {
            const emptyPrimaryVals = primaryHeaders.map(() => '');
            const appendedSecondaryVals = expandedSecondaryCols.map(cIdx => m.rowValues[cIdx] ?? '');
            outputRowsData.push(buildRowValues(emptyPrimaryVals, appendedSecondaryVals));
          });
        }
      }
    }
  }

  // 4. Construct Output Headers
  const expandedHeaders = expandedSecondaryCols.map(cIdx => {
    const origName = secondaryHeaders[cIdx] || `Col_${colIndexToLabel(cIdx)}`;
    return usePrefix ? `${prefixText}.${origName}` : origName;
  });

  const outputHeaders = placement === 'next_to_key'
    ? [...primaryHeaders.slice(0, insertIndex), ...expandedHeaders, ...primaryHeaders.slice(insertIndex)]
    : [...primaryHeaders, ...expandedHeaders];

  // 5. Construct Result Sheet
  const outputColCount = outputHeaders.length;
  const outputRowCount = outputRowsData.length + 1; // including header
  const updatedData: Record<string, any> = {};

  // Header formatting
  outputHeaders.forEach((headerText, cIdx) => {
    const isJoinedCol = expandedHeaders.includes(headerText);
    updatedData[cellPosToKey(0, cIdx)] = {
      raw: headerText,
      value: headerText,
      format: {
        bold: true,
        bgColor: isJoinedCol ? '#6d28d9' : '#107c41', // Purple header for joined columns
        textColor: '#ffffff',
        align: 'left',
      },
    };
  });

  // Data rows
  outputRowsData.forEach((rowVals, rIdx) => {
    const rowNumber = rIdx + 1;
    rowVals.forEach((val, cIdx) => {
      updatedData[cellPosToKey(rowNumber, cIdx)] = {
        raw: String(val ?? ''),
        value: val,
        format: { align: typeof val === 'number' ? 'right' : 'left' },
      };
    });
  });

  // 6. Generate Power Query M formula string
  const primKeyNames = primaryKeyCols.map(c => `"${primaryHeaders[c]}"`).join(', ');
  const secKeyNames = secondaryKeyCols.map(c => `"${secondaryHeaders[c]}"`).join(', ');
  const expColNames = expandedSecondaryCols.map(c => `"${secondaryHeaders[c]}"`).join(', ');
  const expRenames = expandedHeaders.map(h => `"${h}"`).join(', ');

  const formulaM = [
    `= Table.NestedJoin(${primarySheet.name}, {${primKeyNames}}, ${secondarySheet.name}, {${secKeyNames}}, "${secondarySheet.name}", JoinKind.${joinKind})`,
    `= Table.ExpandTableColumn(#"Consultas Mescladas", "${secondarySheet.name}", {${expColNames}}, {${expRenames}})`,
  ].join('\n');

  const resultSheet = recalculateSheet({
    id: primarySheet.id, // Preserve same id for instant reactive updates in Excel & Power BI!
    name: primarySheet.name,
    data: updatedData,
    rowCount: Math.max(outputRowCount, 20),
    colCount: Math.max(outputColCount, 6),
    colWidths: {
      ...primarySheet.colWidths,
      ...outputHeaders.reduce((acc, _, cIdx) => {
        acc[cIdx] = 150;
        return acc;
      }, {} as Record<number, number>),
    },
    rowHeights: primarySheet.rowHeights,
    mergedRegions: [],
    conditionalRules: primarySheet.conditionalRules,
  });

  return {
    sheet: resultSheet,
    matchedCount,
    totalPrimaryRows: Math.max(primarySheet.rowCount - 1, 0),
    totalSecondaryRows: Math.max(secondarySheet.rowCount - 1, 0),
    formulaM,
  };
}


