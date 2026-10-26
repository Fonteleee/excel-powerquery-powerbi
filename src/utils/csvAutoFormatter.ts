import { Sheet, CellData, CellFormat } from '../types/spreadsheet';
import { cellPosToKey, parseNumberSafely, colIndexToLabel } from '../engine/formulaParser';
import { detectHeaderRow, filledCount, isFilled, isSingleCellRow, tableBlockEnd } from './tableLayout';

/**
 * Intelligent CSV / Table Auto-Formatter
 * Parses raw CSV or tabular data, automatically detects headers,
 * infers column types (Currency, Percentage, Date, Numbers, Badges),
 * computes optimal column widths, and adds summary formula rows.
 */
export interface AutoFormatOptions {
  /** Linha (base 0) do cabeçalho. Se omitida, é detectada: títulos e observações acima da tabela são mantidos. */
  headerRow?: number;
}

export function autoFormatTabularData(
  rawData: any[][],
  sheetName = 'Dados Importados',
  options: AutoFormatOptions = {}
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

  // A tabela é o bloco que começa no cabeçalho e vai até a primeira linha em branco; o que está fora dele
  // (títulos, observações, outros blocos) é importado como está, sem forçar tipos de coluna.
  const headerRow = Math.min(Math.max(options.headerRow ?? detectHeaderRow(rawData), 0), numRows - 1);
  const blockEnd = tableBlockEnd(rawData, headerRow);

  const rowCount = Math.max(numRows + 20, 100);
  const colCount = Math.max(numCols + 6, 20);

  const colWidths: { [col: number]: number } = {};
  const rowHeights: { [row: number]: number } = {};
  const data: { [key: string]: CellData } = {};

  // Initialize row heights
  for (let r = 0; r < rowCount; r++) {
    rowHeights[r] = r === headerRow ? 32 : 28;
  }
  const firstFilledRow = rawData.findIndex(row => filledCount(row) > 0);

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
    const headerTitle = String(rawData[headerRow]?.[c] ?? '').trim();

    const isTextHeader = /motivo|raz[aã]o|tipo|descri[cç][aã]o|categoria|nome|agente|id|status/i.test(headerTitle);

    // Só o bloco da tabela define tipo e largura da coluna.
    for (let r = headerRow; r <= blockEnd; r++) {
      const val = rawData[r]?.[c];
      if (val !== null && val !== undefined && val !== '') {
        const strVal = String(val).trim();
        if (strVal.length > maxCharLen) maxCharLen = strVal.length;

        if (r > headerRow) {
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
          // Check pure numbers (códigos com zero à esquerda, como "001", são texto: o zero faz parte do código)
          else if (parseNumberSafely(strVal) !== null && !/^0\d+$/.test(strVal)) {
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

      // Fora da tabela (títulos, observações, outros blocos): valor como está. Números continuam números.
      if (rIdx < headerRow || rIdx > blockEnd) {
        // Título do relatório (primeira linha) e títulos de seção (linha sozinha depois de uma linha em branco).
        const afterBlank = rIdx > 0 && filledCount(rawData[rIdx - 1]) === 0;
        const isTitle = isSingleCellRow(row) && (rIdx === firstFilledRow || (afterBlank && rIdx > blockEnd));
        data[key] = {
          raw: strVal,
          value: typeof cellVal === 'number' ? cellVal : strVal.startsWith('=') ? null : strVal,
          ...(isTitle ? { format: { bold: true, fontSize: rIdx === firstFilledRow ? 13 : undefined } } : {}),
        };
        return;
      }

      // Cabeçalho da tabela
      if (rIdx === headerRow) {
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

  wrapLongText(data, colWidths, rowHeights, numRows, numCols, headerRow);

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

const CHAR_PX = 7.4;
const LINE_PX = 17;
const MAX_ROW_PX = 340;

/**
 * Textos longos não podem ser cortados: a célula quebra em várias linhas e a linha cresce o necessário
 * (as colunas de texto também ganham largura, até um limite).
 */
function wrapLongText(
  data: { [key: string]: CellData },
  colWidths: { [col: number]: number },
  rowHeights: { [row: number]: number },
  numRows: number,
  numCols: number,
  headerRow: number
): void {
  for (let c = 0; c < numCols; c++) {
    let longest = 0;
    for (let r = 0; r < numRows; r++) {
      const v = data[cellPosToKey(r, c)]?.value;
      if (typeof v === 'string' && r !== headerRow && v.length > longest) longest = v.length;
    }
    if (longest > 60) colWidths[c] = Math.max(colWidths[c] ?? 0, Math.min(440, longest * CHAR_PX + 30));
  }
  for (let r = 0; r < numRows; r++) {
    if (r === headerRow) continue;
    let lines = 1;
    for (let c = 0; c < numCols; c++) {
      const cell = data[cellPosToKey(r, c)];
      if (!cell || typeof cell.value !== 'string') continue;
      const fit = Math.max(8, Math.floor(((colWidths[c] ?? 120) - 18) / CHAR_PX));
      if (cell.value.length <= fit) continue;
      cell.format = { ...cell.format, wrap: true };
      lines = Math.max(lines, Math.ceil((cell.value.length * 1.08) / fit));
    }
    if (lines > 1) rowHeights[r] = Math.max(rowHeights[r] ?? 28, Math.min(MAX_ROW_PX, lines * LINE_PX + 10));
  }
}
