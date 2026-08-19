import * as XLSX from 'xlsx';
import { Sheet } from '../types/spreadsheet';
import { getCellValue } from '../engine/formulaParser';
import { PivotResult } from '../types/analytics';

/**
 * Universal One-Click Excel (.XLSX) Exporter
 * Exports any sheet, treated power query dataset, or pivot table directly into a real .xlsx file.
 */
export function exportSheetToExcel(
  sheets: Sheet | Sheet[],
  filename = 'Planilha_Excel_Studio'
): void {
  const sheetArray = Array.isArray(sheets) ? sheets : [sheets];
  const wb = XLSX.utils.book_new();

  sheetArray.forEach(sheet => {
    let maxR = 0;
    let maxC = 0;

    for (const [key, cell] of Object.entries(sheet.data)) {
      if (cell && (cell.raw || cell.value !== null && cell.value !== undefined)) {
        const match = key.match(/^R(\d+)C(\d+)$/);
        if (match) {
          const r = parseInt(match[1], 10);
          const c = parseInt(match[2], 10);
          if (r > maxR) maxR = r;
          if (c > maxC) maxC = c;
        }
      }
    }

    const rowsData: any[][] = [];
    for (let r = 0; r <= maxR; r++) {
      const rowArr: any[] = [];
      for (let c = 0; c <= maxC; c++) {
        const val = getCellValue(sheet, r, c);
        rowArr.push(val !== null && val !== undefined ? val : '');
      }
      rowsData.push(rowArr);
    }

    const ws = XLSX.utils.aoa_to_sheet(rowsData);
    const cleanName = (sheet.name || 'Planilha').replace(/[\\/?*[\]]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanName);
  });

  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

/**
 * Export Power BI Pivot Table + Raw Data directly to Excel
 */
export function exportPivotReportToExcel(
  sheet: Sheet,
  pivotResult: PivotResult,
  kpis: { title: string; value: string }[],
  filename = 'Relatorio_PowerBI_Analytics'
): void {
  const wb = XLSX.utils.book_new();

  // 1. KPI & Pivot Table Sheet
  const reportRows: any[][] = [];
  reportRows.push(['RELATÓRIO POWER BI ANALYTICS - EXCEL PRO STUDIO']);
  reportRows.push(['Gerado em:', new Date().toLocaleString('pt-BR')]);
  reportRows.push([]);

  // KPIs
  reportRows.push(['INDICADORES PRINCIPAIS (KPIS)']);
  kpis.forEach(kpi => {
    reportRows.push([kpi.title, kpi.value]);
  });
  reportRows.push([]);

  // Pivot Table Matrix
  reportRows.push(['TABELA DINÂMICA / MATRIZ DE DADOS']);
  reportRows.push(pivotResult.headers);
  pivotResult.rows.forEach(r => {
    const rowLine: any[] = [r.label.join(' - ')];
    r.cells.forEach(c => rowLine.push(c.value));
    reportRows.push(rowLine);
  });

  const wsReport = XLSX.utils.aoa_to_sheet(reportRows);
  XLSX.utils.book_append_sheet(wb, wsReport, 'Dashboard & Dinâmica');

  // 2. Raw Sheet Data
  let maxR = 0;
  let maxC = 0;
  for (const [key, cell] of Object.entries(sheet.data)) {
    if (cell && (cell.raw || cell.value !== null)) {
      const match = key.match(/^R(\d+)C(\d+)$/);
      if (match) {
        const r = parseInt(match[1], 10);
        const c = parseInt(match[2], 10);
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }

  const rawRows: any[][] = [];
  for (let r = 0; r <= maxR; r++) {
    const rowArr: any[] = [];
    for (let c = 0; c <= maxC; c++) {
      const val = getCellValue(sheet, r, c);
      rowArr.push(val !== null && val !== undefined ? val : '');
    }
    rawRows.push(rowArr);
  }

  const wsData = XLSX.utils.aoa_to_sheet(rawRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'Base de Dados');

  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
