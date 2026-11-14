import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Code,
  X,
  Sparkles,
  FileUp,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { getCellValue, cellPosToKey } from '../../engine/formulaParser';
import {
  createSalesSampleSheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
} from '../../data/sampleDatasets';
import { parseCSVToAutoFormattedSheet } from '../../utils/csvAutoFormatter';
import { notify } from '../../utils/notify';
import { startImport, ImportCancelledError, type ImportJob } from '../../utils/importClient';
import { summarizeReport } from '../../utils/importProtocol';
import type { ImportProgress, ImportReport } from '../../utils/importPipeline';

type ImportState =
  | { phase: 'idle' }
  | { phase: 'running'; fileName: string; progress: ImportProgress }
  | { phase: 'done'; report: ImportReport }
  | { phase: 'error'; message: string };

const fmtSeconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;


interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheets: Sheet[];
  activeSheetId: string;
  onLoadSheet: (sheet: Sheet) => void;
  /** Arquivos importados: todas as abas de uma vez. */
  /** `calculated`: as abas já vêm recalculadas (importação em segundo plano). */
  onImportSheets: (sheets: Sheet[], calculated?: boolean) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  sheets,
  activeSheetId,
  onLoadSheet,
  onImportSheets,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef<ImportJob | null>(null);
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' });

  // Fechar a página encerra a importação em andamento.
  useEffect(() => () => jobRef.current?.cancel(), []);

  if (!isOpen) return null;

  const currentSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // Export to XLSX
  const exportToXLSX = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    sheets.forEach(sheet => {
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
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
    });

    XLSX.writeFile(wb, `${currentSheet.name || 'Planilha_Verxel'}.xlsx`);
    onClose();
  };

  // Export to CSV
  const exportToCSV = () => {
    let maxR = 0;
    let maxC = 0;
    for (const [key, cell] of Object.entries(currentSheet.data)) {
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

    const rows: string[] = [];
    for (let r = 0; r <= maxR; r++) {
      const lineVals: string[] = [];
      for (let c = 0; c <= maxC; c++) {
        const val = getCellValue(currentSheet, r, c);
        const str = val !== null && val !== undefined ? String(val) : '';
        lineVals.push(`"${str.replace(/"/g, '""')}"`);
      }
      rows.push(lineVals.join(';'));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentSheet.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  // Export to JSON
  const exportToJSON = () => {
    const jsonStr = JSON.stringify(sheets, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'verxel_workbook.json';
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  // Excel: leitura, conversão e cálculo rodam num Web Worker; aqui só mostramos o progresso.
  const runWorkbookImport = (data: Uint8Array, fileName: string): void => {
    jobRef.current?.cancel();
    setImportState({ phase: 'running', fileName, progress: { stage: 'reading', message: 'Preparando…', percent: 0 } });
    const job = startImport(data, fileName, {
      onProgress: progress => {
        if (jobRef.current === job) setImportState({ phase: 'running', fileName, progress });
      },
    });
    jobRef.current = job;
    job.promise
      .then(({ sheets: imported, report }) => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        if (imported.length === 0) {
          setImportState({ phase: 'error', message: 'Não encontrei dados neste arquivo.' });
          return;
        }
        onImportSheets(imported, true);
        setImportState({ phase: 'done', report });
        notify(summarizeReport(report), report.totals.divergent > 0 ? 'warning' : 'success');
      })
      .catch(err => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        if (err instanceof ImportCancelledError) setImportState({ phase: 'idle' });
        else setImportState({ phase: 'error', message: err instanceof Error && err.message ? err.message : 'Erro ao processar planilha Excel.' });
      });
  };

  const cancelImport = (): void => {
    const job = jobRef.current;
    jobRef.current = null;
    job?.cancel();
    setImportState({ phase: 'idle' });
    notify('Importação cancelada.', 'info');
  };

  // Handle file import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
      reader.onload = event => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed) && parsed[0]?.data) {
            onLoadSheet(parsed[0]);
          } else if (parsed.data) {
            onLoadSheet(parsed);
          }
          onClose();
        } catch {
          notify('Erro ao carregar arquivo JSON.', 'error');
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      reader.onload = event => {
        try {
          const csvText = event.target?.result as string;
          const formattedSheet = parseCSVToAutoFormattedSheet(
            csvText,
            file.name.replace(/\.[^/.]+$/, '')
          );
          onImportSheets([formattedSheet]);
          onClose();
        } catch {
          notify('Erro ao formatar e carregar arquivo CSV.', 'error');
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = event => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        runWorkbookImport(data, file.name);
      };
      reader.onerror = () => setImportState({ phase: 'error', message: 'Não consegui ler o arquivo.' });
      reader.readAsArrayBuffer(file);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Importar & Exportar Arquivos</h3>
              <p className="text-xs text-slate-500">Importa e exporta arquivos Excel (.xlsx, .xls), CSV e JSON</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[480px] bg-white">
          {/* Export Options */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Download className="size-3.5 text-emerald-700" />
              Exportar Planilha:
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={exportToXLSX}
                className="flex flex-col items-center p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-all text-center group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-2">
                  <FileSpreadsheet className="size-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">Excel (.XLSX)</span>
                <span className="text-[10px] text-slate-500">Múltiplas abas (sem o fluxo)</span>
              </button>

              <button
                onClick={exportToCSV}
                className="flex flex-col items-center p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all text-center group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-blue-100 text-blue-800 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-2">
                  <FileText className="size-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">CSV (.CSV)</span>
                <span className="text-[10px] text-slate-500">Ponto e vírgula</span>
              </button>

              <button
                onClick={exportToJSON}
                className="flex flex-col items-center p-3.5 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 transition-all text-center group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-purple-100 text-purple-800 group-hover:bg-purple-600 group-hover:text-white transition-colors mb-2">
                  <Code className="size-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">JSON (.JSON)</span>
                <span className="text-[10px] text-slate-500">Backup estruturado</span>
              </button>
            </div>
          </div>

          {/* Import file */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Upload className="size-3.5 text-blue-700" />
              Importar do Computador:
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group shadow-2xs"
            >
              <div className="p-2.5 rounded-full bg-emerald-100 group-hover:bg-emerald-200 text-emerald-800 transition-colors">
                <FileUp className="size-6" />
              </div>
              <div className="text-xs font-extrabold text-slate-900">
                Importar Arquivo CSV ou Excel com Auto-Formatação Inteligente
              </div>
              <span className="text-[11px] text-emerald-800 font-medium">
                ⚡ Detecta cabeçalhos, moedas, percentuais, datas, ajusta largura das colunas e insere linha de total automaticamente
              </span>
            </button>

            {importState.phase === 'running' && (
              <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="truncate">Importando {importState.fileName}</span>
                </div>
                <div className="text-[11px] text-blue-900 truncate">{importState.progress.message}</div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(importState.progress.percent)}
                  className="h-2 w-full overflow-hidden rounded-full bg-blue-100"
                >
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.max(2, importState.progress.percent)}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-800">A tela continua livre enquanto o arquivo é processado.</span>
                  <button onClick={cancelImport} className="px-3 py-1 rounded-lg bg-white border border-blue-300 text-blue-900 text-[11px] font-bold hover:bg-blue-100 cursor-pointer">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {importState.phase === 'error' && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{importState.message}</div>
            )}

            {importState.phase === 'done' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2 text-[11px] text-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="size-4" />
                  <span className="truncate">Importação concluída: {importState.report.fileName}</span>
                </div>
                <div className="text-slate-600">
                  Leitura {fmtSeconds(importState.report.timings.readMs)}, conversão {fmtSeconds(importState.report.timings.convertMs)}, cálculo {fmtSeconds(importState.report.timings.calcMs)}.
                </div>
                <div className="font-bold text-slate-900">Relatório de fidelidade</div>
                {importState.report.totals.formulas === 0 ? (
                  <div>Nenhuma fórmula neste arquivo: os valores entraram como estão.</div>
                ) : (
                  <>
                    <div>
                      <strong>{importState.report.totals.formulas.toLocaleString('pt-BR')}</strong> fórmulas importadas:{' '}
                      <strong>{importState.report.totals.matched.toLocaleString('pt-BR')}</strong> batem com o resultado do Excel,{' '}
                      <strong>{importState.report.totals.fallback.toLocaleString('pt-BR')}</strong> com o valor do arquivo como reserva (o motor não calculou)
                      {importState.report.totals.divergent > 0 && (
                        <>, <strong className="text-amber-700">{importState.report.totals.divergent.toLocaleString('pt-BR')}</strong> divergem do Excel</>
                      )}
                      {importState.report.totals.unverified > 0 && <>, {importState.report.totals.unverified.toLocaleString('pt-BR')} não comparáveis (data/hora)</>}.
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-emerald-200 bg-white">
                      <table className="w-full text-[10px]">
                        <thead className="bg-emerald-100 text-emerald-900">
                          <tr>
                            <th className="text-left px-2 py-1">Aba</th>
                            <th className="text-right px-2 py-1">Fórmulas</th>
                            <th className="text-right px-2 py-1">Batem</th>
                            <th className="text-right px-2 py-1">Reserva</th>
                            <th className="text-right px-2 py-1">Divergem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importState.report.sheets.map(s => (
                            <tr key={s.name} className="border-t border-emerald-100">
                              <td className="px-2 py-1 truncate max-w-[160px]">{s.name}</td>
                              <td className="px-2 py-1 text-right">{s.formulas.toLocaleString('pt-BR')}</td>
                              <td className="px-2 py-1 text-right">{s.matched.toLocaleString('pt-BR')}</td>
                              <td className="px-2 py-1 text-right">{s.fallback.toLocaleString('pt-BR')}</td>
                              <td className="px-2 py-1 text-right">{s.divergent.toLocaleString('pt-BR')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {importState.report.skipped.length > 0 && (
                  <div><strong>Abas ignoradas:</strong> {importState.report.skipped.join(', ')}</div>
                )}
                {importState.report.notes.map(note => (
                  <div key={note} className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">{note}</div>
                ))}
              </div>
            )}
          </div>


          {/* Fluxo de Relacionamentos: a exportação (SQL e aba _Flow_v1) vive na barra da aba Relacionamentos,
              onde o grafo real está em memória; aqui só orientamos para não haver duas cópias do fluxo. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
            <strong>Fluxo de Relacionamentos:</strong> para exportar o fluxo como SQL ou levá-lo dentro do Excel (aba oculta
            <code className="mx-1">_Flow_v1</code>), use o botão <strong>Exportar</strong> na barra da aba Relacionamentos.
            O botão “Excel (.XLSX)” acima exporta só as planilhas, sem o fluxo.
          </div>

          {/* Load Sample Datasets */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-600" />
              Carregar Modelos Prontos de Demonstração:
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => {
                  onLoadSheet(createSalesSampleSheet());
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-left transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-slate-800">Vendas & Comercial</div>
                <div className="text-[10px] text-slate-500">Com fórmulas de comissão e total</div>
              </button>

              <button
                onClick={() => {
                  onLoadSheet(createHRStaffSampleSheet());
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-left transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-slate-800">RH & Folha</div>
                <div className="text-[10px] text-slate-500">Horas extras, INSS e e-mails</div>
              </button>

              <button
                onClick={() => {
                  onLoadSheet(createFinancialBudgetSheet());
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-left transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-slate-800">Orçamento & DRE</div>
                <div className="text-[10px] text-slate-500">Planejado vs Realizado</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
