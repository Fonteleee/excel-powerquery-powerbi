import { Sheet } from '../types/spreadsheet';
import { RelationEdge } from '../types/relations';
import { colIndexToLabel, cellPosToKey, recalculateSheet } from './formulaParser';
import { createEmptySheet } from '../data/sampleDatasets';

/**
 * Retorna o cabeçalho/nome da coluna em row 0 ou fallback para a letra da coluna
 */
export function getColumnHeaderName(sheet: Sheet, colIdx: number): string {
  const headerKey = cellPosToKey(0, colIdx);
  const cell = sheet.data[headerKey];
  if (cell && cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
    return String(cell.value).trim();
  }
  return `Coluna_${colIndexToLabel(colIdx)}`;
}

/**
 * Retorna o nome da planilha formatado para fórmulas Excel (com aspas simples se tiver espaços ou caracteres especiais)
 */
export function formatSheetNameForFormula(sheetName: string): string {
  if (/[\s\-\.\_\/\\]/.test(sheetName)) {
    return `'${sheetName.replace(/'/g, "''")}'`;
  }
  return sheetName;
}

/**
 * Gera a fórmula correspondente (suporta tanto mesma tabela quanto tabelas cruzadas)
 */
export function generateRelationFormula(
  edge: RelationEdge,
  sourceSheet: Sheet,
  targetSheet: Sheet,
  rowIdx: number
): string {
  const isSameSheet = sourceSheet.id === targetSheet.id;
  const sourceColLetter = colIndexToLabel(edge.sourceColIdx);
  const targetColLetter = colIndexToLabel(edge.targetColIdx);
  const targetReturnColLetter = colIndexToLabel(edge.returnColIdx);
  const targetSheetFormatted = formatSheetNameForFormula(targetSheet.name);

  // Células da linha atual (ex: A2, B2)
  const sourceCellRef = `${sourceColLetter}${rowIdx + 1}`;
  const targetCellRef = `${targetColLetter}${rowIdx + 1}`;

  const notFoundText = edge.ifNotFound !== undefined ? edge.ifNotFound : '';
  const delimiter = edge.delimiter !== undefined ? edge.delimiter : ' - ';
  const compareOp = edge.compareOperator || '>=';
  const ifTrue = edge.ifTrueValue || 'Sim';
  const ifFalse = edge.ifFalseValue || 'Não';

  // --- 1. OPERAÇÕES INTRA-TABELA (MESMA PLANILHA) ---
  if (isSameSheet) {
    switch (edge.formulaType) {
      case 'SUM_COLS':
        // =A2 + B2
        return `=${sourceCellRef} + ${targetCellRef}`;

      case 'SUB_COLS':
        // =A2 - B2
        return `=${sourceCellRef} - ${targetCellRef}`;

      case 'MULT_COLS':
        // =A2 * B2
        return `=${sourceCellRef} * ${targetCellRef}`;

      case 'DIV_COLS':
        // =SEERRO(A2 / B2; 0)
        return `=SEERRO(${sourceCellRef} / ${targetCellRef}; 0)`;

      case 'PCT_DIFF':
        // =SEERRO((B2 - A2) / A2; 0)
        return `=SEERRO((${targetCellRef} - ${sourceCellRef}) / ${sourceCellRef}; 0)`;

      case 'CONCAT':
        // =A2 & " " & B2
        return `=${sourceCellRef} & "${delimiter}" & ${targetCellRef}`;

      case 'IF_COMPARE':
        // =SE(A2 >= B2; "Sim"; "Não")
        return `=SE(${sourceCellRef} ${compareOp} ${targetCellRef}; "${ifTrue}"; "${ifFalse}")`;

      case 'ROW_LAG':
        // =A2 - A1 (Variação com a linha anterior)
        if (rowIdx <= 1) return `=${sourceCellRef}`;
        return `=${sourceCellRef} - ${sourceColLetter}${rowIdx}`;

      case 'RUNNING_TOTAL':
        // =SOMA($A$2:A2) (Soma acumulada)
        return `=SOMA($${sourceColLetter}$2:${sourceCellRef})`;

      case 'UNIRTEXTO':
        return `=UNIRTEXTO("${delimiter}"; VERDADEIRO; ${sourceCellRef}; ${targetCellRef})`;

      case 'PROCX':
        // Auto-PROCX na mesma tabela (ex: buscar ID do Gerente na coluna de IDs de Funcionário)
        return `=PROCX(${sourceCellRef}; ${targetColLetter}:${targetColLetter}; ${targetReturnColLetter}:${targetReturnColLetter}; "${notFoundText}")`;

      case 'SOMASE':
        return `=SOMASE(${targetColLetter}:${targetColLetter}; ${sourceCellRef}; ${targetReturnColLetter}:${targetReturnColLetter})`;

      case 'CONT.SE':
        return `=CONT.SE(${targetColLetter}:${targetColLetter}; ${sourceCellRef})`;

      case 'MEDIASE':
        return `=MÉDIASE(${targetColLetter}:${targetColLetter}; ${sourceCellRef}; ${targetReturnColLetter}:${targetReturnColLetter})`;

      default:
        return `=${sourceCellRef} + ${targetCellRef}`;
    }
  }

  // --- 2. OPERAÇÕES ENTRE TABELAS DIFERENTES (CROSS-SHEET) ---
  const targetKeyRange = `${targetSheetFormatted}!${targetColLetter}:${targetColLetter}`;
  const targetReturnRange = `${targetSheetFormatted}!${targetReturnColLetter}:${targetReturnColLetter}`;

  switch (edge.formulaType) {
    case 'PROCX':
      return `=PROCX(${sourceCellRef}; ${targetKeyRange}; ${targetReturnRange}; "${notFoundText}")`;

    case 'SOMASE':
      return `=SOMASE(${targetKeyRange}; ${sourceCellRef}; ${targetReturnRange})`;

    case 'CONT.SE':
      return `=CONT.SE(${targetKeyRange}; ${sourceCellRef})`;

    case 'MEDIASE':
      return `=MÉDIASE(${targetKeyRange}; ${sourceCellRef}; ${targetReturnRange})`;

    case 'PROCV': {
      const minColIdx = Math.min(edge.targetColIdx, edge.returnColIdx);
      const maxColIdx = Math.max(edge.targetColIdx, edge.returnColIdx);
      const tableRange = `${targetSheetFormatted}!${colIndexToLabel(minColIdx)}:${colIndexToLabel(maxColIdx)}`;
      const colOffset = Math.abs(edge.returnColIdx - edge.targetColIdx) + 1;
      return `=PROCV(${sourceCellRef}; ${tableRange}; ${colOffset}; FALSO)`;
    }

    case 'UNIRTEXTO':
      return `=UNIRTEXTO("${delimiter}"; VERDADEIRO; FILTRO(${targetReturnRange}; ${targetKeyRange}=${sourceCellRef}; "${notFoundText}"))`;

    case 'FILTRO':
      return `=FILTRO(${targetReturnRange}; ${targetKeyRange}=${sourceCellRef}; "${notFoundText || 'Nenhum'}")`;

    default:
      return `=PROCX(${sourceCellRef}; ${targetKeyRange}; ${targetReturnRange}; "${notFoundText}")`;
  }
}

/**
 * Aplica o relacionamento diretamente na planilha, gerando colunas/linhas calculadas
 * e recalculando com TODAS as planilhas do grafo.
 */
export function applyRelationToSpreadsheet(edge: RelationEdge, sheets: Sheet[]): Sheet[] {
  const sourceSheet = sheets.find(s => s.id === edge.sourceSheetId);
  const targetSheet = sheets.find(s => s.id === edge.targetSheetId);

  if (!sourceSheet || !targetSheet) return sheets;

  const isSameSheet = sourceSheet.id === targetSheet.id;
  const sourceHeaderName = getColumnHeaderName(sourceSheet, edge.sourceColIdx);
  const targetHeaderName = getColumnHeaderName(targetSheet, edge.returnColIdx);

  // Nome do cabeçalho gerado
  let generatedHeaderTitle = edge.customColName?.trim();
  if (!generatedHeaderTitle) {
    if (isSameSheet) {
      if (edge.formulaType === 'SUM_COLS') generatedHeaderTitle = `Soma_${sourceHeaderName}_${targetHeaderName}`;
      else if (edge.formulaType === 'SUB_COLS') generatedHeaderTitle = `Dif_${sourceHeaderName}_${targetHeaderName}`;
      else if (edge.formulaType === 'MULT_COLS') generatedHeaderTitle = `Prod_${sourceHeaderName}_${targetHeaderName}`;
      else if (edge.formulaType === 'DIV_COLS') generatedHeaderTitle = `Razao_${sourceHeaderName}_${targetHeaderName}`;
      else if (edge.formulaType === 'PCT_DIFF') generatedHeaderTitle = `VarPct_${targetHeaderName}`;
      else if (edge.formulaType === 'CONCAT') generatedHeaderTitle = `Juncao_${sourceHeaderName}_${targetHeaderName}`;
      else if (edge.formulaType === 'IF_COMPARE') generatedHeaderTitle = `Status_${sourceHeaderName}`;
      else if (edge.formulaType === 'RUNNING_TOTAL') generatedHeaderTitle = `Acumulado_${sourceHeaderName}`;
      else if (edge.formulaType === 'ROW_LAG') generatedHeaderTitle = `VarLinha_${sourceHeaderName}`;
      else if (edge.formulaType === 'PROCX') generatedHeaderTitle = `PROCX_${targetHeaderName}`;
      else generatedHeaderTitle = `Calc_${sourceHeaderName}_${targetHeaderName}`;
    } else {
      generatedHeaderTitle = `${targetSheet.name}_${targetHeaderName}`;
    }
  }

  // --- DESTINO: PRÓXIMA COLUNA VAZIA (IMEDIATAMENTE APÓS O ÚLTIMO CABEÇALHO) ---
  if (edge.outputDestination === 'next_column') {
    let lastHeaderCol = 0;
    for (let c = 0; c < sourceSheet.colCount; c++) {
      const headerVal = sourceSheet.data[cellPosToKey(0, c)]?.value;
      if (headerVal !== null && headerVal !== undefined && String(headerVal).trim() !== '') {
        lastHeaderCol = Math.max(lastHeaderCol, c);
      }
    }
    const targetCol = lastHeaderCol + 1;
    const newColCount = Math.max(sourceSheet.colCount, targetCol + 1);
    const newData = { ...sourceSheet.data };

    // Cabeçalho destacado na linha 0
    newData[cellPosToKey(0, targetCol)] = {
      raw: generatedHeaderTitle,
      value: generatedHeaderTitle,
      format: { bold: true, bgColor: '#4f46e5', textColor: '#ffffff' },
    };

    // Injeta a fórmula nas linhas
    const maxRowToApply = Math.max(sourceSheet.rowCount, 10);
    for (let r = 1; r < maxRowToApply; r++) {
      const sourceVal = sourceSheet.data[cellPosToKey(r, edge.sourceColIdx)]?.value;
      if (sourceVal !== null && sourceVal !== undefined && sourceVal !== '' || r < 30) {
        const formula = generateRelationFormula(edge, sourceSheet, targetSheet, r);
        newData[cellPosToKey(r, targetCol)] = {
          raw: formula,
          value: '',
          format: {
            type: edge.formulaType === 'PCT_DIFF' ? 'percentage' : 'general',
          },
        };
      }
    }

    const updatedSheet: Sheet = {
      ...sourceSheet,
      colCount: newColCount,
      data: newData,
    };

    // Recalcula passando a lista completa de sheets para que referências cruzadas ('OutraAba'!A:A) sejam resolvidas!
    const allWithUpdated = sheets.map(s => (s.id === sourceSheet.id ? updatedSheet : s));
    const recalculated = recalculateSheet(updatedSheet, allWithUpdated);
    return allWithUpdated.map(s => (s.id === sourceSheet.id ? recalculated : s));
  }

  // --- DESTINO: LINHA ABAIXO (RODAPÉ / TOTAIS) ---
  if (edge.outputDestination === 'below_row') {
    const lastRow = sourceSheet.rowCount;
    const newData = { ...sourceSheet.data };
    const colLetter = colIndexToLabel(edge.sourceColIdx);

    // Linha de total
    newData[cellPosToKey(lastRow, 0)] = {
      raw: `Total ${sourceHeaderName}`,
      value: `Total ${sourceHeaderName}`,
      format: { bold: true, bgColor: '#f8fafc' },
    };

    newData[cellPosToKey(lastRow, edge.sourceColIdx)] = {
      raw: `=SOMA(${colLetter}2:${colLetter}${lastRow})`,
      value: '',
      format: { bold: true, bgColor: '#f1f5f9' },
    };

    const updatedSheet: Sheet = {
      ...sourceSheet,
      rowCount: lastRow + 1,
      data: newData,
    };

    const allWithUpdated = sheets.map(s => (s.id === sourceSheet.id ? updatedSheet : s));
    const recalculated = recalculateSheet(updatedSheet, allWithUpdated);
    return allWithUpdated.map(s => (s.id === sourceSheet.id ? recalculated : s));
  }

  // --- DESTINO: NOVA ABA RELACIONAL ---
  if (edge.outputDestination === 'new_sheet') {
    const newSheetId = `sheet-rel-${Date.now()}`;
    const newSheetName = isSameSheet
      ? `Calc_${sourceSheet.name.slice(0, 15)}`
      : `Rel_${sourceSheet.name.slice(0, 10)}_${targetSheet.name.slice(0, 10)}`;
    const newSheet = createEmptySheet(newSheetId, newSheetName, sourceSheet.rowCount, sourceSheet.colCount + 1);

    const newData = { ...newSheet.data };
    for (let r = 0; r < sourceSheet.rowCount; r++) {
      for (let c = 0; c < sourceSheet.colCount; c++) {
        const cell = sourceSheet.data[cellPosToKey(r, c)];
        if (cell) {
          newData[cellPosToKey(r, c)] = { ...cell };
        }
      }
    }

    const relCol = sourceSheet.colCount;
    newData[cellPosToKey(0, relCol)] = {
      raw: generatedHeaderTitle,
      value: generatedHeaderTitle,
      format: { bold: true, bgColor: '#4f46e5', textColor: '#ffffff' },
    };

    for (let r = 1; r < sourceSheet.rowCount; r++) {
      const formula = generateRelationFormula(edge, sourceSheet, targetSheet, r);
      newData[cellPosToKey(r, relCol)] = {
        raw: formula,
        value: '',
      };
    }

    const allWithNew = [...sheets, newSheet];
    const recalculatedNewSheet = recalculateSheet(
      { ...newSheet, data: newData },
      allWithNew
    );

    return [...sheets, recalculatedNewSheet];
  }

  return sheets;
}
