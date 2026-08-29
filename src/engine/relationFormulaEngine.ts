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
  return `Campo_${colIndexToLabel(colIdx)}`;
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
 * Gera a fórmula Excel correspondente para uma linha específica
 */
export function generateRelationFormula(
  edge: RelationEdge,
  sourceSheet: Sheet,
  targetSheet: Sheet,
  rowIdx: number
): string {
  const sourceColLetter = colIndexToLabel(edge.sourceColIdx);
  const targetKeyColLetter = colIndexToLabel(edge.targetColIdx);
  const targetReturnColLetter = colIndexToLabel(edge.returnColIdx);
  const targetSheetFormatted = formatSheetNameForFormula(targetSheet.name);

  // Célula da chave na tabela de origem (ex: A2)
  const sourceCellRef = `${sourceColLetter}${rowIdx + 1}`;

  // Intervalos de coluna inteira na tabela de destino (ex: 'Vendas'!A:A)
  const targetKeyRange = `${targetSheetFormatted}!${targetKeyColLetter}:${targetKeyColLetter}`;
  const targetReturnRange = `${targetSheetFormatted}!${targetReturnColLetter}:${targetReturnColLetter}`;

  const notFoundText = edge.ifNotFound !== undefined ? edge.ifNotFound : '';
  const delimiter = edge.delimiter || ', ';

  switch (edge.formulaType) {
    case 'PROCX':
      // =PROCX(A2; 'Tabela2'!A:A; 'Tabela2'!C:C; "")
      return `=PROCX(${sourceCellRef}; ${targetKeyRange}; ${targetReturnRange}; "${notFoundText}")`;

    case 'SOMASE':
      // =SOMASE('Tabela2'!A:A; A2; 'Tabela2'!C:C)
      return `=SOMASE(${targetKeyRange}; ${sourceCellRef}; ${targetReturnRange})`;

    case 'CONT.SE':
      // =CONT.SE('Tabela2'!A:A; A2)
      return `=CONT.SE(${targetKeyRange}; ${sourceCellRef})`;

    case 'MEDIASE':
      // =MÉDIASE('Tabela2'!A:A; A2; 'Tabela2'!C:C)
      return `=MÉDIASE(${targetKeyRange}; ${sourceCellRef}; ${targetReturnRange})`;

    case 'PROCV': {
      // PROCV clássico: precisa que a coluna chave seja a primeira do intervalo de busca
      const minColIdx = Math.min(edge.targetColIdx, edge.returnColIdx);
      const maxColIdx = Math.max(edge.targetColIdx, edge.returnColIdx);
      const minColLetter = colIndexToLabel(minColIdx);
      const maxColLetter = colIndexToLabel(maxColIdx);
      const tableRange = `${targetSheetFormatted}!${minColLetter}:${maxColLetter}`;
      const colOffset = Math.abs(edge.returnColIdx - edge.targetColIdx) + 1;
      return `=PROCV(${sourceCellRef}; ${tableRange}; ${colOffset}; FALSO)`;
    }

    case 'UNIRTEXTO':
      // =UNIRTEXTO(", "; VERDADEIRO; FILTRO('Tabela2'!C:C; 'Tabela2'!A:A=A2; ""))
      return `=UNIRTEXTO("${delimiter}"; VERDADEIRO; FILTRO(${targetReturnRange}; ${targetKeyRange}=${sourceCellRef}; "${notFoundText}"))`;

    case 'FILTRO':
      // =FILTRO('Tabela2'!C:C; 'Tabela2'!A:A=A2; "Nenhum")
      return `=FILTRO(${targetReturnRange}; ${targetKeyRange}=${sourceCellRef}; "${notFoundText || 'Nenhum'}")`;

    default:
      return `=PROCX(${sourceCellRef}; ${targetKeyRange}; ${targetReturnRange}; "${notFoundText}")`;
  }
}

/**
 * Aplica o relacionamento diretamente na planilha, gerando as colunas e fórmulas correspondentes
 */
export function applyRelationToSpreadsheet(edge: RelationEdge, sheets: Sheet[]): Sheet[] {
  const sourceSheet = sheets.find(s => s.id === edge.sourceSheetId);
  const targetSheet = sheets.find(s => s.id === edge.targetSheetId);

  if (!sourceSheet || !targetSheet) return sheets;

  const targetHeaderName = getColumnHeaderName(targetSheet, edge.returnColIdx);
  const generatedHeaderTitle = edge.customColName?.trim() || `${targetSheet.name}_${targetHeaderName}`;

  if (edge.outputDestination === 'next_column') {
    // 1. Encontrar a próxima coluna livre na planilha de origem
    let targetCol = sourceSheet.colCount;
    // Verifica se a última coluna atual possui algum dado; se não, pode reaproveitar
    for (let c = 0; c < sourceSheet.colCount; c++) {
      let colHasData = false;
      for (let r = 0; r < Math.min(sourceSheet.rowCount, 10); r++) {
        const val = sourceSheet.data[cellPosToKey(r, c)]?.value;
        if (val !== null && val !== undefined && val !== '') {
          colHasData = true;
          break;
        }
      }
      if (!colHasData && c > edge.sourceColIdx) {
        targetCol = c;
        break;
      }
    }

    const newColCount = Math.max(sourceSheet.colCount, targetCol + 1);
    const newData = { ...sourceSheet.data };

    // Define o cabeçalho na Linha 0
    newData[cellPosToKey(0, targetCol)] = {
      raw: generatedHeaderTitle,
      value: generatedHeaderTitle,
      format: { bold: true, bgColor: '#f1f5f9' },
    };

    // Injeta a fórmula para todas as linhas preenchidas da tabela de origem
    const maxRowToApply = Math.max(sourceSheet.rowCount, 10);
    for (let r = 1; r < maxRowToApply; r++) {
      const sourceVal = sourceSheet.data[cellPosToKey(r, edge.sourceColIdx)]?.value;
      // Aplica a fórmula se a linha de origem tiver valor ou até a linha 50
      if (sourceVal !== null && sourceVal !== undefined && sourceVal !== '' || r < 30) {
        const formula = generateRelationFormula(edge, sourceSheet, targetSheet, r);
        newData[cellPosToKey(r, targetCol)] = {
          raw: formula,
          value: '', // será calculado pelo recalculateSheet
          format: { type: 'general' },
        };
      }
    }

    const updatedSourceSheet: Sheet = {
      ...sourceSheet,
      colCount: newColCount,
      data: newData,
    };

    const recalculated = recalculateSheet(updatedSourceSheet);

    return sheets.map(s => (s.id === sourceSheet.id ? recalculated : s));
  }

  if (edge.outputDestination === 'new_sheet') {
    // Cria uma nova aba combinada
    const newSheetId = `sheet-rel-${Date.now()}`;
    const newSheetName = `Rel_${sourceSheet.name.slice(0, 10)}_${targetSheet.name.slice(0, 10)}`;
    const newSheet = createEmptySheet(newSheetId, newSheetName, sourceSheet.rowCount, sourceSheet.colCount + 1);

    const newData = { ...newSheet.data };

    // Copia colunas da planilha de origem
    for (let r = 0; r < sourceSheet.rowCount; r++) {
      for (let c = 0; c < sourceSheet.colCount; c++) {
        const cell = sourceSheet.data[cellPosToKey(r, c)];
        if (cell) {
          newData[cellPosToKey(r, c)] = { ...cell };
        }
      }
    }

    // Adiciona nova coluna de relacionamento
    const relCol = sourceSheet.colCount;
    newData[cellPosToKey(0, relCol)] = {
      raw: generatedHeaderTitle,
      value: generatedHeaderTitle,
      format: { bold: true, bgColor: '#e0e7ff', textColor: '#3730a3' },
    };

    for (let r = 1; r < sourceSheet.rowCount; r++) {
      const formula = generateRelationFormula(edge, sourceSheet, targetSheet, r);
      newData[cellPosToKey(r, relCol)] = {
        raw: formula,
        value: '',
      };
    }

    const recalculatedNewSheet = recalculateSheet({
      ...newSheet,
      data: newData,
    });

    return [...sheets, recalculatedNewSheet];
  }

  // Fallback: next_column
  return sheets;
}
