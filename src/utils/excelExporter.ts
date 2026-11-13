// src/utils/excelExporter.ts
// Fachada leve da exportação: o código pesado (ExcelJS e SheetJS, mais de 1 MB) só é baixado quando o usuário exporta.

import type { Sheet } from '../types/spreadsheet';
import type { PivotResult } from '../types/analytics';
import type { FlowGraph } from '../features/relations/model/graph';
import type { PowerBIExportOptions } from './excelExporterCore';

export type { PowerBIExportOptions };

export function exportSheetToExcel(sheets: Sheet | Sheet[], filename = 'Planilha_Verxel', flowGraph?: FlowGraph): void {
  import('./excelExporterCore')
    .then(m => m.exportSheetToExcel(sheets, filename, flowGraph))
    .catch(err => console.error('Falha ao exportar o .xlsx:', err));
}

export async function exportPivotReportToExcel(
  sheet: Sheet,
  pivotResult: PivotResult,
  kpis: { title: string; value: string }[],
  filename = 'Relatorio_Analitico',
  options?: PowerBIExportOptions
): Promise<void> {
  const m = await import('./excelExporterCore');
  return m.exportPivotReportToExcel(sheet, pivotResult, kpis, filename, options);
}
