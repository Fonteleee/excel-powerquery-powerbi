import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Sheet } from '../types/spreadsheet';
import { cellPosToKey, parseNumberSafely } from '../engine/formulaParser';
import { PivotResult } from '../types/analytics';
import { generateBarChartImage, generateDonutChartImage } from './chartImageGenerator';

/**
 * Portuguese to Standard English Excel Formula Names Map
 * Real Excel (.xlsx) files store formula names in English (OpenXML standard).
 * Excel Desktop automatically translates them to Portuguese (ex: SUM -> SOMA, XLOOKUP -> PROCX) when opened!
 */
const PT_TO_EN_FORMULA_MAP: { [ptName: string]: string } = {
  // Search & Reference
  'PROCX': 'XLOOKUP',
  'PROCV': 'VLOOKUP',
  'PROCH': 'HLOOKUP',
  'CORRESPX': 'XMATCH',
  'CORRESP': 'MATCH',
  'ÍNDICE': 'INDEX',
  'INDICE': 'INDEX',
  'DESLOQ': 'OFFSET',
  'INDIRETO': 'INDIRECT',
  'LIN': 'ROW',
  'LINHA': 'ROW',
  'COL': 'COLUMN',
  'COLUNA': 'COLUMN',
  'LINS': 'ROWS',
  'LINHAS': 'ROWS',
  'COLS': 'COLUMNS',
  'COLUNAS': 'COLUMNS',

  // Logic & Error
  'SE': 'IF',
  'SEERRO': 'IFERROR',
  'SES': 'IFS',
  'PARÂMETRO': 'SWITCH',
  'PARAMETRO': 'SWITCH',
  'E': 'AND',
  'OU': 'OR',
  'NÃO': 'NOT',
  'NAO': 'NOT',
  'XOU': 'XOR',

  // Math & Stats
  'SOMA': 'SUM',
  'SOMASE': 'SUMIF',
  'SOMASES': 'SUMIFS',
  'MÉDIA': 'AVERAGE',
  'MEDIA': 'AVERAGE',
  'MÉDIASE': 'AVERAGEIF',
  'MEDIASE': 'AVERAGEIF',
  'MÉDIASES': 'AVERAGEIFS',
  'MEDIASES': 'AVERAGEIFS',
  'CONT.SE': 'COUNTIF',
  'CONT.SES': 'COUNTIFS',
  'CONT.VALORES': 'COUNTA',
  'CONT.NÚM': 'COUNT',
  'CONT.NUM': 'COUNT',
  'CONTAR.VAZIO': 'COUNTBLANK',
  'MÁXIMO': 'MAX',
  'MAXIMO': 'MAX',
  'MÍNIMO': 'MIN',
  'MINIMO': 'MIN',
  'MÁXIMOSES': 'MAXIFS',
  'MAXIMOSES': 'MAXIFS',
  'MÍNIMOSES': 'MINIFS',
  'MINIMOSES': 'MINIFS',
  'MULT': 'PRODUCT',
  'SOMARPRODUTO': 'SUMPRODUCT',
  'MED': 'MEDIAN',
  'MODO.ÚNICO': 'MODE.SNGL',
  'MODO.UNICO': 'MODE.SNGL',
  'MODO.MULT': 'MODE.MULT',
  'DESVPAD.P': 'STDEV.P',
  'DESVPAD.A': 'STDEV.S',
  'ARRED': 'ROUND',
  'ARREDONDAR.PARA.CIMA': 'ROUNDUP',
  'ARREDONDAR.PARA.BAIXO': 'ROUNDDOWN',
  'ABS': 'ABS',
  'RAIZ': 'SQRT',
  'POTÊNCIA': 'POWER',
  'POTENCIA': 'POWER',
  'MOD': 'MOD',
  'INT': 'INT',
  'TRUNCAR': 'TRUNC',
  'ALEATÓRIO': 'RAND',
  'ALEATORIO': 'RAND',
  'ALEATÓRIOENTRE': 'RANDBETWEEN',
  'ALEATORIOENTRE': 'RANDBETWEEN',

  // Text
  'CONCAT': 'CONCAT',
  'UNIRTEXTO': 'TEXTJOIN',
  'CONCATENAR': 'CONCATENATE',
  'MAIÚSCULA': 'UPPER',
  'MAIUSCULA': 'UPPER',
  'MINÚSCULA': 'LOWER',
  'MINUSCULA': 'LOWER',
  'PRI.MAIÚSCULA': 'PROPER',
  'PRI.MAIUSCULA': 'PROPER',
  'ARRUMAR': 'TRIM',
  'NÚM.CARACT': 'LEN',
  'NUM.CARACT': 'LEN',
  'EXT.TEXTO': 'MID',
  'ESQUERDA': 'LEFT',
  'DIREITA': 'RIGHT',
  'LOCALIZAR': 'SEARCH',
  'PROCURAR': 'FIND',
  'SUBSTITUIR': 'SUBSTITUTE',
  'MUDAR': 'REPLACE',
  'VALOR.NÚMERO': 'NUMBERVALUE',
  'VALOR.NUMERO': 'NUMBERVALUE',
  'CARACT.UNICODE': 'UNICHAR',
  'UNICODE': 'UNICODE',

  // Dynamic Array & Modern
  'ÚNICO': 'UNIQUE',
  'UNICO': 'UNIQUE',
  'FILTRO': 'FILTER',
  'CLASSIFICAR': 'SORT',
  'CLASSIFICARPOR': 'SORTBY',
  'SEQUÊNCIA': 'SEQUENCE',
  'SEQUENCIA': 'SEQUENCE',
  'MATRIZALEATÓRIA': 'RANDARRAY',
  'MATRIZALEATORIA': 'RANDARRAY',

  // Date & Time
  'HOJE': 'TODAY',
  'AGORA': 'NOW',
  'DIAS': 'DAYS',
  'DIATRABALHO': 'WORKDAY',
  'DIATRABALHOTOTAL': 'NETWORKDAYS',
  'DATADIF': 'DATEDIF',
  'DATA': 'DATE',
  'ANO': 'YEAR',
  'MÊS': 'MONTH',
  'MES': 'MONTH',
  'DIA': 'DAY',
  'HORA': 'HOUR',
  'MINUTO': 'MINUTE',
  'SEGUNDO': 'SECOND',

  // Information
  'ÉFÓRMULA': 'ISFORMULA',
  'EFORMULA': 'ISFORMULA',
  'FÓRMULATEXTO': 'FORMULATEXT',
  'FORMULATEXTO': 'FORMULATEXT',
  'ÉNÚM': 'ISNUMBER',
  'ENUM': 'ISNUMBER',
  'ÉNUMERO': 'ISNUMBER',
  'ENUMERO': 'ISNUMBER',
  'ÉTEXTO': 'ISTEXT',
  'ETEXTO': 'ISTEXT',
  'ÉVAZIO': 'ISBLANK',
  'EVAZIO': 'ISBLANK',
  'ÉEMBRANCO': 'ISBLANK',
  'EEMBRANCO': 'ISBLANK',
  'ÉERRO': 'ISERROR',
  'EERRO': 'ISERROR',
  'É.NÃO.DISP': 'ISNA',
  'E.NAO.DISP': 'ISNA',
  'NÃO.DISP': 'NA',
  'NAO.DISP': 'NA',
};

/**
 * Modern Excel OpenXML functions that REQUIRE '_xlfn.' namespace prefix in .xlsx XML structure.
 * Without '_xlfn.', Microsoft Excel treats them as unknown user-defined functions and displays #NOME? / #NAME?
 */
const XLFN_MODERN_FUNCTIONS = new Set([
  'XLOOKUP',
  'XMATCH',
  'TEXTJOIN',
  'CONCAT',
  'IFS',
  'SWITCH',
  'MAXIFS',
  'MINIFS',
  'UNIQUE',
  'FILTER',
  'SORT',
  'SORTBY',
  'SEQUENCE',
  'RANDARRAY',
  'LET',
  'LAMBDA',
  'XOR',
  'DAYS',
  'ISFORMULA',
  'FORMULATEXT',
  'NUMBERVALUE',
  'UNICHAR',
  'UNICODE',
  'BITAND',
  'BITOR',
  'BITXOR',
  'BITLSHIFT',
  'BITRSHIFT',
  'STDEV.P',
  'STDEV.S',
  'MODE.SNGL',
  'MODE.MULT',
  'COVARIANCE.P',
  'COVARIANCE.S',
  'PERCENTILE.EXC',
  'PERCENTILE.INC',
  'RANK.AVG',
  'RANK.EQ',
  'CEILING.MATH',
  'FLOOR.MATH',
  'NORM.DIST',
  'NORM.INV',
  'T.DIST',
  'T.INV',
  'F.DIST',
  'F.INV',
  'CHISQ.DIST',
  'CHISQ.INV',
]);

/**
 * Translates formula string from Portuguese/English syntax to standard OpenXML Excel formula syntax,
 * and automatically applies '_xlfn.' prefix to all modern Excel functions so MS Excel
 * opens and evaluates them natively without '#NOME?' / '#NAME?' errors.
 */
export function translateFormulaToExcelEn(formula: string): string {
  if (!formula) return '';
  let clean = formula.startsWith('=') ? formula.substring(1).trim() : formula.trim();

  // 1. Replace Portuguese function names with standard English names
  for (const [pt, en] of Object.entries(PT_TO_EN_FORMULA_MAP)) {
    const escaped = pt.replace(/\./g, '\\.');
    const regex = new RegExp(`\\b${escaped}\\b(?=\\s*\\()`, 'gi');
    clean = clean.replace(regex, en);
  }

  // 2. Replace boolean literals
  clean = clean.replace(/\bVERDADEIRO\b/gi, 'TRUE');
  clean = clean.replace(/\bFALSO\b/gi, 'FALSE');

  // 3. Replace semicolons (;) with commas (,) outside quoted strings
  let inQuote = false;
  let separated = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"') {
      inQuote = !inQuote;
      separated += char;
    } else if (char === ';' && !inQuote) {
      separated += ',';
    } else {
      separated += char;
    }
  }

  // 4. Inject '_xlfn.' namespace for all modern Excel functions (e.g. XLOOKUP -> _xlfn.XLOOKUP)
  for (const modernFunc of XLFN_MODERN_FUNCTIONS) {
    const escaped = modernFunc.replace(/\./g, '\\.');
    // Replace modern function name that does not already have _xlfn. prefix
    const regex = new RegExp(`(?<!_xlfn\\.)\\b${escaped}\\b(?=\\s*\\()`, 'gi');
    separated = separated.replace(regex, `_xlfn.${modernFunc}`);
  }

  return separated;
}

/**
 * Builds a single XLSX Worksheet from a given Sheet data structure with formula preservation and column widths
 */
export function buildWorksheetFromSheet(sheet: Sheet): XLSX.WorkSheet {
  let maxR = 0;
  let maxC = 0;

  for (const [key, cell] of Object.entries(sheet.data)) {
    if (cell && (cell.raw || (cell.value !== null && cell.value !== undefined))) {
      const match = key.match(/^R(\d+)C(\d+)$/);
      if (match) {
        const r = parseInt(match[1], 10);
        const c = parseInt(match[2], 10);
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }

  const ws: XLSX.WorkSheet = {};

  for (let r = 0; r <= maxR; r++) {
    for (let c = 0; c <= maxC; c++) {
      const key = cellPosToKey(r, c);
      const cell = sheet.data[key];
      const cellRef = XLSX.utils.encode_cell({ r, c });

      if (!cell) {
        continue;
      }

      const raw = cell.raw;
      const val = cell.value;

      // If cell has a formula (e.g. '=PROCX(...)', '=CONCAT(...)', '=SOMA(...)')
      if (typeof raw === 'string' && raw.trim().startsWith('=')) {
        const enFormula = translateFormulaToExcelEn(raw);
        const cellObj: XLSX.CellObject = {
          t: typeof val === 'number' ? 'n' : typeof val === 'boolean' ? 'b' : 's',
          v: val !== null && val !== undefined ? val : '',
          f: enFormula,
        };
        ws[cellRef] = cellObj;
      } else if (val !== null && val !== undefined && val !== '') {
        const numVal = parseNumberSafely(val);
        if (typeof val === 'number') {
          ws[cellRef] = { t: 'n', v: val };
        } else if (numVal !== null && !String(val).includes(':') && !String(val).includes('/')) {
          ws[cellRef] = { t: 'n', v: numVal };
        } else if (typeof val === 'boolean') {
          ws[cellRef] = { t: 'b', v: val };
        } else {
          ws[cellRef] = { t: 's', v: String(val) };
        }
      }
    }
  }

  // Set dimensions
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(maxR, 0), c: Math.max(maxC, 0) },
  });

  // Set column widths
  if (sheet.colWidths) {
    const cols: XLSX.ColInfo[] = [];
    for (let c = 0; c <= maxC; c++) {
      const wPx = sheet.colWidths[c] || 110;
      cols.push({ wch: Math.max(Math.round(wPx / 8), 10) });
    }
    ws['!cols'] = cols;
  }

  return ws;
}

/**
 * Universal One-Click Excel (.XLSX) Exporter with True Formula Preservation
 * Exports all sheets preserving dynamic formulas, numbers, and formatting so MS Excel calculates them natively!
 */
export function exportSheetToExcel(
  sheets: Sheet | Sheet[],
  filename = 'Planilha_Excel_Studio'
): void {
  const sheetArray = Array.isArray(sheets) ? sheets : [sheets];
  const wb = XLSX.utils.book_new();

  sheetArray.forEach(sheet => {
    const ws = buildWorksheetFromSheet(sheet);
    const cleanName = (sheet.name || 'Planilha').replace(/[\\/?*[\]]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanName);
  });

  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

export interface PowerBIExportOptions {
  dimensionName?: string;
  metricName?: string;
  chartData?: { name: string; value: number; percent: number }[];
  totalSum?: number;
  avgVal?: number;
  formatMetricValue?: (val: number, isAverage?: boolean) => string;
}

/**
 * Export Comprehensive Multi-Sheet Power BI Analytics Report with Embedded Visual Charts:
 * 1. Sheet: DASHBOARD E KPIS (Executive KPIs, Data Table + Embedded High-Res Bar Chart & Donut Chart!)
 * 2. Sheet: TABELA DINAMICA (Pivot Table matrix with multi-dimensional dimensions, values, and grand totals)
 * 3. Sheet: [Raw Data Sheet Name] (Full raw data table with formulas, styles, and column widths)
 */
export async function exportPivotReportToExcel(
  sheet: Sheet,
  pivotResult: PivotResult,
  kpis: { title: string; value: string }[],
  filename = 'Relatorio_PowerBI_Analytics',
  options?: PowerBIExportOptions
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NocoDB Power BI Studio';
  wb.created = new Date();

  const dimensionName = options?.dimensionName || 'Dimensão';
  const metricName = options?.metricName || 'Valor';
  const chartData = options?.chartData || [];
  const fmtVal = options?.formatMetricValue || ((v: number) => String(v));

  // Generate high-resolution Bar and Donut chart images
  const barChartBase64 = generateBarChartImage(chartData, {
    title: `Distribuição: ${dimensionName} por ${metricName}`,
    metricLabel: metricName,
    formatValue: fmtVal,
  });

  const donutChartBase64 = generateDonutChartImage(chartData, {
    title: 'Participação Percentual (%)',
    totalSum: options?.totalSum,
    formatValue: fmtVal,
  });

  // ==========================================
  // 1. ABA: DASHBOARD E KPIS
  // ==========================================
  const wsDash = wb.addWorksheet('DASHBOARD E KPIS', {
    views: [{ showGridLines: true }],
  });

  // Column Widths
  wsDash.columns = [
    { width: 32 }, // Col A
    { width: 26 }, // Col B
    { width: 20 }, // Col C
    { width: 6 },  // Col D (Spacer)
    { width: 14 }, // Col E
    { width: 14 }, // Col F
    { width: 14 }, // Col G
    { width: 14 }, // Col H
    { width: 14 }, // Col I
    { width: 14 }, // Col J
    { width: 14 }, // Col K
    { width: 14 }, // Col L
  ];

  // Header Title
  const titleRow = wsDash.addRow(['POWER BI VISUAL STUDIO - DASHBOARD E KPIS']);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C41' } };
  wsDash.mergeCells('A1:C1');

  // Metadata Row
  wsDash.addRow(['Tabela / Fonte de Dados:', sheet.name, 'Data de Exportação:', new Date().toLocaleString('pt-BR')]);
  wsDash.getCell('A2').font = { bold: true, size: 10, color: { argb: 'FF475569' } };
  wsDash.getCell('B2').font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };

  wsDash.addRow([]);

  // KPIs Section
  const kpiHeader = wsDash.addRow(['INDICADORES PRINCIPAIS DE DESEMPENHO (KPIS)', '']);
  kpiHeader.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
  wsDash.mergeCells(`A${kpiHeader.number}:B${kpiHeader.number}`);

  const kpiSubHeader = wsDash.addRow(['Indicador', 'Valor / Métrica']);
  kpiSubHeader.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  kpiSubHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

  kpis.forEach(kpi => {
    const row = wsDash.addRow([kpi.title, kpi.value]);
    row.getCell(1).font = { size: 10, color: { argb: 'FF334155' } };
    row.getCell(2).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
    row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
  });

  wsDash.addRow([]);

  // Distribution Data Table (Chart source table)
  const distHeader = wsDash.addRow([`DISTRIBUIÇÃO: ${dimensionName.toUpperCase()} (DADOS DOS GRÁFICOS)`]);
  distHeader.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
  wsDash.mergeCells(`A${distHeader.number}:C${distHeader.number}`);

  const distSubHeader = wsDash.addRow([dimensionName, `${metricName} (Valor)`, 'Participação (%)']);
  distSubHeader.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  distSubHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

  if (chartData.length > 0) {
    chartData.forEach(item => {
      const row = wsDash.addRow([
        item.name,
        typeof item.value === 'number' ? fmtVal(item.value) : item.value,
        `${(item.percent ?? 0).toFixed(1)}%`,
      ]);
      row.getCell(1).font = { size: 10, color: { argb: 'FF1E293B' } };
      row.getCell(2).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      row.getCell(3).font = { bold: true, size: 10, color: { argb: 'FF059669' } };
      row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      row.getCell(3).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });

    if (options?.totalSum !== undefined) {
      const totRow = wsDash.addRow(['Total Geral', fmtVal(options.totalSum), '100.0%']);
      totRow.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
      totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      totRow.border = { top: { style: 'medium', color: { argb: 'FF059669' } } };
    }
  }

  // EMBED CHARTS INTO EXCEL SHEET!
  if (barChartBase64) {
    const barImgId = wb.addImage({
      base64: barChartBase64,
      extension: 'png',
    });
    wsDash.addImage(barImgId, {
      tl: { col: 4, row: 3 },
      ext: { width: 580, height: 320 },
    });
  }

  if (donutChartBase64) {
    const donutImgId = wb.addImage({
      base64: donutChartBase64,
      extension: 'png',
    });
    wsDash.addImage(donutImgId, {
      tl: { col: 4, row: 20 },
      ext: { width: 580, height: 320 },
    });
  }

  // ==========================================
  // 2. ABA: TABELA DINAMICA
  // ==========================================
  const wsPivot = wb.addWorksheet('TABELA DINAMICA', {
    views: [{ showGridLines: true }],
  });
  wsPivot.columns = [
    { width: 35 },
    { width: 28 },
    { width: 28 },
    { width: 28 },
  ];

  const pivotTitle = wsPivot.addRow(['POWER BI - TABELA DINÂMICA / MATRIZ ANALÍTICA']);
  pivotTitle.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  pivotTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C41' } };
  wsPivot.mergeCells('A1:C1');

  wsPivot.addRow(['Tabela de Origem:', sheet.name, 'Dimensão:', dimensionName, 'Métrica:', metricName]);
  wsPivot.addRow([]);

  if (pivotResult && pivotResult.headers && pivotResult.headers.length > 0) {
    const hRow = wsPivot.addRow(pivotResult.headers);
    hRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

    pivotResult.rows.forEach(r => {
      const rowLabel = r.isGrandTotal ? 'Total Geral' : r.label.join(' - ') || '—';
      const rowVals: any[] = [rowLabel];
      r.cells.forEach(c => {
        const cellDisplay = typeof c.value === 'number' ? fmtVal(c.value) : (c.value ?? '');
        rowVals.push(cellDisplay);
      });
      const row = wsPivot.addRow(rowVals);
      if (r.isGrandTotal) {
        row.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        row.border = { top: { style: 'medium', color: { argb: 'FF059669' } } };
      } else {
        row.getCell(1).font = { size: 10, color: { argb: 'FF1E293B' } };
        for (let i = 2; i <= rowVals.length; i++) {
          row.getCell(i).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        }
      }
    });
  }

  // ==========================================
  // 3. ABA: DADOS BRUTOS (PLANILHA ORIGINAL COM FÓRMULAS)
  // ==========================================
  const cleanSheetName = (sheet.name || 'Dados').replace(/[\\/?*[\]]/g, '').substring(0, 31);
  const wsRaw = wb.addWorksheet(cleanSheetName, {
    views: [{ showGridLines: true }],
  });

  // Calculate Column Widths
  const rawCols: { width: number }[] = [];
  for (let c = 0; c < sheet.colCount; c++) {
    const wPx = sheet.colWidths?.[c] || 110;
    rawCols.push({ width: Math.max(Math.round(wPx / 8), 12) });
  }
  wsRaw.columns = rawCols;

  // Export raw rows and formulas
  for (let r = 0; r < sheet.rowCount; r++) {
    const rowValues: any[] = [];
    for (let c = 0; c < sheet.colCount; c++) {
      const cell = sheet.data[cellPosToKey(r, c)];
      if (!cell || (cell.raw === '' && cell.value === null)) {
        rowValues.push('');
      } else if (cell.raw && cell.raw.startsWith('=')) {
        const enFormula = translateFormulaToExcelEn(cell.raw);
        rowValues.push({ formula: enFormula, result: cell.value });
      } else if (typeof cell.value === 'number') {
        rowValues.push(cell.value);
      } else if (cell.value !== null && cell.value !== undefined) {
        rowValues.push(cell.value);
      } else {
        rowValues.push(cell.raw || '');
      }
    }
    const row = wsRaw.addRow(rowValues);
    if (r === 0) {
      row.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107C41' } };
    }
  }

  // Write and trigger download in browser
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  anchor.download = finalName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
