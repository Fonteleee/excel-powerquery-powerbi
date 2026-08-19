import { Sheet, CellData, CellFormat } from '../types/spreadsheet';
import { cellPosToKey, parseNumberSafely, colIndexToLabel } from '../engine/formulaParser';

/**
 * Intelligent CSV / Table Auto-Formatter
 * Parses raw CSV or tabular data, automatically detects headers,
 * infers column types (Currency, Percentage, Date, Numbers, Badges),
 * computes optimal column widths, and adds summary formula rows.
 */
export function autoFormatTabularData(
  rawData: any[][],
  sheetName = 'Dados Importados'
): Sheet {
  if (!rawData || rawData.length === 0) {
    return {
      id: `sheet-${Date.now()}`,
      name: sheetName,
      data: {},
      rowCount: 100,
      colCount: 26,
      colWidths: {},
      rowHeights: {},
      mergedRegions: [],
      conditionalRules: [],
    };
  }

  // Determine actual dimensions
  const numRows = rawData.length;
  let numCols = 0;
  rawData.forEach(row => {
    if (Array.isArray(row) && row.length > numCols) {
      numCols = row.length;
    }
  });

  const rowCount = Math.max(numRows + 20, 100);
  const colCount = Math.max(numCols + 6, 20);

  const colWidths: { [col: number]: number } = {};
  const rowHeights: { [row: number]: number } = {};
  const data: { [key: string]: CellData } = {};

  // Initialize row heights
  for (let r = 0; r < rowCount; r++) {
    rowHeights[r] = r === 0 ? 32 : 28;
  }

  // 1. Analyze each column to infer type and calculate optimal width
  const columnTypes: ('currency' | 'percentage' | 'number' | 'date' | 'time' | 'status' | 'text')[] = [];

  for (let c = 0; c < numCols; c++) {
    let maxCharLen = 8;
    let currencyCount = 0;
    let percentCount = 0;
    let numberCount = 0;
    let dateCount = 0;
    let timeCount = 0;
    let statusCount = 0;
    let sampleCount = 0;
    const headerTitle = String(rawData[0]?.[c] || '').trim();

    const isTextHeader = /motivo|raz[aã]o|tipo|descri[cç][aã]o|categoria|nome|agente|id|status/i.test(headerTitle);

    for (let r = 0; r < numRows; r++) {
      const val = rawData[r]?.[c];
      if (val !== null && val !== undefined && val !== '') {
        const strVal = String(val).trim();
        if (strVal.length > maxCharLen) maxCharLen = strVal.length;

        if (r > 0) {
          sampleCount++;
          // Check Time strings (HH:MM or HH:MM:SS) or Header containing Time/Pausa/Duration (excluding Motivo/Razão/Tipo)
          if (
            !isTextHeader &&
            (/^\d{1,2}:\d{2}(:\d{2})?$/.test(strVal) || /tempo|dura[cç][aã]o|perman[eê]ncia|chamada|atendimento|horas?|minutos?|time/i.test(headerTitle))
          ) {
            timeCount++;
          }
          // Check Date
          else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(strVal) || /^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
            dateCount++;
          }
          // Check Currency
          else if (
            strVal.startsWith('R$') ||
            strVal.startsWith('$') ||
            strVal.startsWith('€') ||
            /pre[cç]o|valor|sal[aá]rio|total|faturamento|custo|lucro|receita/i.test(headerTitle)
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
          // Check Status keywords
          else if (/^(conclu[ií]do|pendente|ativo|inativo|aprovado|reprovado|cancelado|pago|aberto)$/i.test(strVal)) {
            statusCount++;
          }
          // Check pure numbers
          else if (parseNumberSafely(strVal) !== null) {
            numberCount++;
          }
        }
      }
    }

    // Determine primary type
    let inferredType: 'currency' | 'percentage' | 'number' | 'date' | 'time' | 'status' | 'text' = 'text';
    if (sampleCount > 0) {
      if (timeCount / sampleCount >= 0.5) inferredType = 'time';
      else if (currencyCount / sampleCount >= 0.5) inferredType = 'currency';
      else if (percentCount / sampleCount >= 0.5) inferredType = 'percentage';
      else if (dateCount / sampleCount >= 0.5) inferredType = 'date';
      else if (statusCount / sampleCount >= 0.5) inferredType = 'status';
      else if (numberCount / sampleCount >= 0.6) inferredType = 'number';
    }
    columnTypes[c] = inferredType;

    // Optimal column width (min 75, max 350)
    colWidths[c] = Math.min(Math.max(maxCharLen * 9 + 30, 80), 350);
  }

  // 2. Populate and format cells
  rawData.forEach((row, rIdx) => {
    if (!Array.isArray(row)) return;

    row.forEach((cellVal, cIdx) => {
      const strVal = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
      if (strVal === '') return; // Never populate empty cells

      const key = cellPosToKey(rIdx, cIdx);
      const colType = columnTypes[cIdx] || 'text';


      // Header Row (Row 0)
      if (rIdx === 0) {
        data[key] = {
          raw: strVal,
          value: strVal,
          format: {
            bold: true,
            bgColor: '#107c41', // Emerald Green Excel header
            textColor: '#ffffff',
            align: colType === 'currency' || colType === 'percentage' || colType === 'number' ? 'right' : (colType === 'time' || colType === 'date' ? 'center' : 'left'),
            fontSize: 11,
          },
        };
        return;
      }

      // Data Rows
      const format: CellFormat = {
        align: colType === 'currency' || colType === 'percentage' || colType === 'number' ? 'right' : (colType === 'time' || colType === 'date' ? 'center' : 'left'),
        textColor: '#1e293b',
      };

      let parsedVal: any = strVal;

      if (colType === 'time') {
        // Formato padrão Excel exato HH:MM:SS (ex: 03:17:26, 00:54:40, 04:00:05)
        format.type = 'time_hh_mm_ss';
        format.align = 'center';
        const num = parseNumberSafely(strVal);
        if (num !== null) parsedVal = num;
      }

 else if (colType === 'currency') {
        format.type = 'currency';
        format.decimals = 2;
        const num = parseNumberSafely(strVal);
        if (num !== null) parsedVal = num;
      } else if (colType === 'percentage') {
        format.type = 'percentage';
        format.decimals = 1;
        const num = parseNumberSafely(strVal);
        if (num !== null) parsedVal = num;
      } else if (colType === 'number') {
        format.type = 'number';
        format.decimals = strVal.includes('.') || strVal.includes(',') ? 2 : 0;
        const num = parseNumberSafely(strVal);
        if (num !== null) parsedVal = num;
      } else if (colType === 'date') {
        format.align = 'center';
      } else if (colType === 'status') {
        format.align = 'center';
        format.bold = true;
        if (/conclu[ií]do|ativo|aprovado|pago/i.test(strVal)) {
          format.textColor = '#15803d'; // Green
        } else if (/pendente|aberto/i.test(strVal)) {
          format.textColor = '#d97706'; // Amber
        } else {
          format.textColor = '#dc2626'; // Red
        }
      }

      data[key] = {
        raw: strVal,
        value: typeof parsedVal === 'number' ? parsedVal : (strVal.startsWith('=') ? null : strVal),
        format,
      };
    });
  });


  // 3. Auto-generate "TOTAL GERAL" Summary row if there are numeric columns
  const numericCols = columnTypes
    .map((t, idx) => (t === 'currency' || t === 'number' ? idx : -1))
    .filter(idx => idx !== -1);

  if (numericCols.length > 0 && numRows > 2) {
    const totalRowIndex = numRows;
    const labelCol = Math.max(0, numericCols[0] - 1);
    const labelKey = cellPosToKey(totalRowIndex, labelCol);

    data[labelKey] = {
      raw: 'TOTAL GERAL',
      value: 'TOTAL GERAL',
      format: {
        bold: true,
        align: 'right',
        textColor: '#0f172a',
      },
    };

    numericCols.forEach(colIdx => {
      const colLetter = colIndexToLabel(colIdx);
      const sumFormula = `=SOMA(${colLetter}2:${colLetter}${totalRowIndex})`;
      const sumKey = cellPosToKey(totalRowIndex, colIdx);
      const isCur = columnTypes[colIdx] === 'currency';

      data[sumKey] = {
        raw: sumFormula,
        value: null,
        format: {
          bold: true,
          align: 'right',
          type: isCur ? 'currency' : 'number',
          decimals: isCur ? 2 : 0,
          bgColor: '#f0fdf4',
          textColor: '#15803d',
        },
      };
    });
  }

  return {
    id: `sheet-${Date.now()}`,
    name: sheetName,
    data,
    rowCount: Math.max(numRows + 30, 100),
    colCount,
    colWidths,
    rowHeights,
    mergedRegions: [],
    conditionalRules: [],
  };
}

/**
 * Intelligent CSV String Parser (Auto-detects delimiter: ;, ,, \t, |)
 */
export function parseCSVToAutoFormattedSheet(csvText: string, sheetName = 'Dados CSV'): Sheet {
  if (!csvText || !csvText.trim()) {
    return autoFormatTabularData([], sheetName);
  }

  const lines = csvText.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return autoFormatTabularData([], sheetName);

  // Detect delimiter from top 5 lines
  const sampleLines = lines.slice(0, 5).join('\n');
  const countSemicolon = (sampleLines.match(/;/g) || []).length;
  const countComma = (sampleLines.match(/,/g) || []).length;
  const countTab = (sampleLines.match(/\t/g) || []).length;
  const countPipe = (sampleLines.match(/\|/g) || []).length;

  let delimiter = ';';
  const maxCount = Math.max(countSemicolon, countComma, countTab, countPipe);
  if (maxCount === countTab && countTab > 0) delimiter = '\t';
  else if (maxCount === countPipe && countPipe > 0) delimiter = '|';
  else if (maxCount === countComma && countComma > countSemicolon) delimiter = ',';
  else delimiter = ';';

  // Robust line tokenizer handling quotes
  const matrix: string[][] = [];

  for (const line of lines) {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    tokens.push(current.trim());
    matrix.push(tokens);
  }

  return autoFormatTabularData(matrix, sheetName);
}
