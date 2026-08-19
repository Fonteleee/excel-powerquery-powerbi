import { Sheet, CellFormat, CellData } from '../types/spreadsheet';
import { cellPosToKey, getCellValue, parseNumberSafely, colIndexToLabel, recalculateSheet } from '../engine/formulaParser';

export interface DataRecognitionReport {
  totalColumnsAnalyzed: number;
  columnsFormatted: {
    colIndex: number;
    colLabel: string;
    headerName: string;
    detectedType: string;
    description: string;
  }[];
  summaryText: string;
}

/**
 * Automatically inspects the sheet data, infers semantic types for each column,
 * applies proper formats and returns a comprehensive diagnosis report for the user.
 */
export function autoRecognizeAndFormatSheet(sheet: Sheet): {
  sheet: Sheet;
  report: DataRecognitionReport;
} {
  const updatedData = { ...sheet.data };
  const updatedColWidths = { ...sheet.colWidths };
  const reportList: DataRecognitionReport['columnsFormatted'] = [];

  for (let c = 0; c < sheet.colCount; c++) {
    const colLabel = colIndexToLabel(c);
    const headerKey = cellPosToKey(0, c);
    const headerCell = sheet.data[headerKey];
    const headerTitle = String(headerCell?.value || headerCell?.raw || '').trim();

    let sampleCount = 0;
    let timeCount = 0;
    let currencyCount = 0;
    let percentCount = 0;
    let dateCount = 0;
    let numberCount = 0;
    let maxCharLen = Math.max(8, headerTitle.length);

    const isTextHeader = /motivo|raz[aã]o|tipo|descri[cç][aã]o|categoria|nome|agente|id|status/i.test(headerTitle);

    // Sample rows 1..min(100, rowCount)
    for (let r = 1; r < Math.min(sheet.rowCount, 100); r++) {
      const val = getCellValue(sheet, r, c);
      if (val !== null && val !== undefined && val !== '') {
        sampleCount++;
        const strVal = String(val).trim();
        if (strVal.length > maxCharLen) maxCharLen = strVal.length;

        const isTimeHeader = /logado|tempo|pausa|dura[cç][aã]o|perman[eê]ncia|chamada|atendimento|horas?|minutos?|time/i.test(headerTitle);

        // Check Time
        if (
          !isTextHeader &&
          (/^\d{1,2}:\d{2}(:\d{2})?$/.test(strVal) || isTimeHeader)
        ) {
          timeCount++;
        }
        // Check Date
        else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(strVal) || /^\d{4}-\d{2}-\d{2}$/.test(strVal) || /data|nascimento|vencimento|admiss[aã]o/i.test(headerTitle)) {
          dateCount++;
        }
        // Check Currency
        else if (
          !isTimeHeader && (
            strVal.startsWith('R$') ||
            strVal.startsWith('$') ||
            strVal.startsWith('€') ||
            /pre[cç]o|valor|sal[aá]rio|faturamento|custo|lucro|receita|venda/i.test(headerTitle) ||
            (/^total$/i.test(headerTitle) || /total\s*geral|total\s*vendas/i.test(headerTitle))
          )
        ) {
          currencyCount++;
        }

        // Check Percentage
        else if (
          strVal.endsWith('%') ||
          /desconto|taxa|margem|variação|comiss[aã]o|%/i.test(headerTitle)
        ) {
          percentCount++;
        }
        // Check Pure Number
        else if (parseNumberSafely(strVal) !== null) {
          numberCount++;
        }
      }
    }

    if (sampleCount === 0) continue;

    let targetType: CellFormat['type'] | null = null;
    let typeName = '';
    let align: 'left' | 'center' | 'right' = 'left';

    if (timeCount / sampleCount >= 0.4) {
      targetType = 'time_hh_mm_ss';
      typeName = 'Hora / Tempo (03:17:26)';
      align = 'center';
    }

 else if (currencyCount / sampleCount >= 0.4) {
      targetType = 'currency';
      typeName = 'Moeda Real (R$)';
      align = 'right';
    } else if (percentCount / sampleCount >= 0.4) {
      targetType = 'percentage';
      typeName = 'Percentual (%)';
      align = 'right';
    } else if (dateCount / sampleCount >= 0.4) {
      targetType = 'date';
      typeName = 'Data (DD/MM/AAAA)';
      align = 'center';
    } else if (numberCount / sampleCount >= 0.6) {
      targetType = 'number';
      typeName = 'Número com Milhar';
      align = 'right';
    }

    if (targetType) {
      // Apply format to all rows in column c
      for (let r = 1; r < sheet.rowCount; r++) {
        const key = cellPosToKey(r, c);
        const cell = updatedData[key];
        if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
          updatedData[key] = {
            ...cell,
            format: {
              ...(cell.format || {}),
              type: targetType,
              align,
              decimals: targetType === 'currency' ? 2 : targetType === 'percentage' ? 1 : cell.format?.decimals,
            },
          };
        }
      }

      // Adjust column width
      updatedColWidths[c] = Math.min(Math.max(maxCharLen * 9 + 30, 85), 320);

      reportList.push({
        colIndex: c,
        colLabel,
        headerName: headerTitle || `Coluna ${colLabel}`,
        detectedType: typeName,
        description: `Coluna ${colLabel} ("${headerTitle || colLabel}") reconhecida como ${typeName}`,
      });
    }
  }

  const newSheet = recalculateSheet({
    ...sheet,
    data: updatedData,
    colWidths: updatedColWidths,
  });

  const report: DataRecognitionReport = {
    totalColumnsAnalyzed: sheet.colCount,
    columnsFormatted: reportList,
    summaryText:
      reportList.length > 0
        ? `✨ ${reportList.length} colunas identificadas e formatadas automaticamente!`
        : 'Nenhuma coluna precisou de ajuste.',
  };

  return { sheet: newSheet, report };
}
