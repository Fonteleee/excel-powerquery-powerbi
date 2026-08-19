import React, { useRef } from 'react';
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Code,
  X,
  Sparkles,
  FileUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Sheet } from '../../types/spreadsheet';
import { getCellValue, cellPosToKey } from '../../engine/formulaParser';
import {
  createSalesSampleSheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
} from '../../data/sampleDatasets';
import { autoFormatTabularData, parseCSVToAutoFormattedSheet } from '../../utils/csvAutoFormatter';


interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheets: Sheet[];
  activeSheetId: string;
  onLoadSheet: (sheet: Sheet) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  sheets,
  activeSheetId,
  onLoadSheet,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // Export to XLSX
  const exportToXLSX = () => {
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

    XLSX.writeFile(wb, `${currentSheet.name || 'Planilha_Excel'}.xlsx`);
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
    link.download = 'excel_studio_workbook.json';
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  // Handle file import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
          alert('Erro ao carregar arquivo JSON.');
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
          onLoadSheet(formattedSheet);
          onClose();
        } catch {
          alert('Erro ao formatar e carregar arquivo CSV.');
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = event => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawAoa: any[][] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false,
          });


          const autoFormatted = autoFormatTabularData(
            rawAoa,
            firstSheetName || file.name.replace(/\.[^/.]+$/, '')
          );


          onLoadSheet(autoFormatted);
          onClose();
        } catch (err) {
          alert('Erro ao processar planilha Excel.');
        }
      };
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
              <p className="text-xs text-slate-500">Compatibilidade nativa com Microsoft Excel, CSV e JSON</p>
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
                <span className="text-[10px] text-slate-500">Múltiplas abas e fórmulas</span>
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
