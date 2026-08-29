import * as XLSX from 'xlsx';
import { Sheet } from '../types/spreadsheet';
import { cellPosToKey, parseNumberSafely } from '../engine/formulaParser';
import { PivotResult } from '../types/analytics';

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
 * Export Comprehensive Multi-Sheet Power BI Analytics Report:
 * 1. Sheet: DASHBOARD E KPIS (Executive KPIs + Chart distribution datasets for Bar and Donut/Pie charts)
 * 2. Sheet: TABELA DINAMICA (Pivot Table matrix with multi-dimensional dimensions, values, and grand totals)
 * 3. Sheet: [Raw Data Sheet Name] (Full raw data table with formulas, styles, and column widths)
 */
export function exportPivotReportToExcel(
  sheet: Sheet,
  pivotResult: PivotResult,
  kpis: { title: string; value: string }[],
  filename = 'Relatorio_PowerBI_Analytics',
  options?: PowerBIExportOptions
): void {
  const wb = XLSX.utils.book_new();

  const dimensionName = options?.dimensionName || 'Dimensão / Categoria';
  const metricName = options?.metricName || 'Métrica / Valor';
  const chartData = options?.chartData || [];
  const fmtVal = options?.formatMetricValue || ((v: number) => String(v));

  // ==========================================
  // 1. ABA: DASHBOARD E KPIS
  // ==========================================
  const dashRows: any[][] = [];
  dashRows.push(['POWER BI VISUAL STUDIO - DASHBOARD E KPIS']);
  dashRows.push(['Tabela / Fonte de Dados:', sheet.name, '', 'Data de Exportação:', new Date().toLocaleString('pt-BR')]);
  dashRows.push([]);

  // Seção de KPIs
  dashRows.push(['INDICADORES PRINCIPAIS DE DESEMPENHO (KPIS)']);
  dashRows.push(['Indicador', 'Valor / Métrica']);
  kpis.forEach(kpi => {
    dashRows.push([kpi.title, kpi.value]);
  });
  dashRows.push([]);

  // Seção de Dados dos Gráficos (Distribuição & Participação)
  dashRows.push([`DISTRIBUIÇÃO: ${dimensionName.toUpperCase()} POR ${metricName.toUpperCase()} (DADOS DOS GRÁFICOS)`]);
  dashRows.push([dimensionName, `${metricName} (Valor)`, 'Participação (%)']);

  if (chartData.length > 0) {
    chartData.forEach(item => {
      dashRows.push([
        item.name,
        typeof item.value === 'number' ? fmtVal(item.value) : item.value,
        `${(item.percent ?? 0).toFixed(1)}%`,
      ]);
    });
    if (options?.totalSum !== undefined) {
      dashRows.push([
        'Total Geral',
        fmtVal(options.totalSum),
        '100.0%',
      ]);
    }
  } else if (pivotResult && pivotResult.rows.length > 0) {
    pivotResult.rows.forEach(r => {
      dashRows.push([
        r.label.join(' - '),
        r.cells[0]?.value !== undefined ? (typeof r.cells[0].value === 'number' ? fmtVal(r.cells[0].value) : r.cells[0].value) : '',
      ]);
    });
  }

  dashRows.push([]);
  dashRows.push(['* Nota: Esta tabela alimenta os gráficos de Barras e Rosca/Pizza no Power BI Studio e pode ser usada no Excel para gerar gráficos dinâmicos (Inserir -> Gráficos).']);

  const wsDash = XLSX.utils.aoa_to_sheet(dashRows);
  wsDash['!cols'] = [
    { wch: 38 },
    { wch: 28 },
    { wch: 20 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDash, 'DASHBOARD E KPIS');

  // ==========================================
  // 2. ABA: TABELA DINAMICA
  // ==========================================
  const pivotRows: any[][] = [];
  pivotRows.push(['POWER BI - TABELA DINÂMICA / MATRIZ ANALÍTICA']);
  pivotRows.push(['Tabela de Origem:', sheet.name, 'Dimensão:', dimensionName, 'Métrica:', metricName]);
  pivotRows.push([]);

  if (pivotResult && pivotResult.headers && pivotResult.headers.length > 0) {
    pivotRows.push(pivotResult.headers);
    pivotResult.rows.forEach(r => {
      const rowLabel = r.isGrandTotal ? 'Total Geral' : r.label.join(' - ') || '—';
      const rowLine: any[] = [rowLabel];
      r.cells.forEach(c => {
        const cellDisplay = typeof c.value === 'number' ? fmtVal(c.value) : (c.value ?? '');
        rowLine.push(cellDisplay);
      });
      pivotRows.push(rowLine);
    });
  } else {
    pivotRows.push(['Nenhum dado agregado disponível para tabela dinâmica.']);
  }

  const wsPivot = XLSX.utils.aoa_to_sheet(pivotRows);
  wsPivot['!cols'] = [
    { wch: 35 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPivot, 'TABELA DINAMICA');

  // ==========================================
  // 3. ABA: DADOS BRUTOS (PLANILHA ORIGINAL COM FÓRMULAS)
  // ==========================================
  const wsRaw = buildWorksheetFromSheet(sheet);
  const cleanSheetName = (sheet.name || 'Dados').replace(/[\\/?*[\]]/g, '').substring(0, 31);
  XLSX.utils.book_append_sheet(wb, wsRaw, cleanSheetName);

  // Write file
  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
