import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  Code,
  Database,
  Download,
  Globe,
  Lock,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { exportSheetToExcel } from '../../utils/excelExporter';

interface NocoShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
}

export const NocoShareModal: React.FC<NocoShareModalProps> = ({
  isOpen,
  onClose,
  sheet,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  if (!isOpen) return null;

  const currentUrl = window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(sheet, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet.name || 'tabela'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySql = () => {
    const tableName = (sheet.name || 'tabela').replace(/\s+/g, '_').toLowerCase();
    const sql = `SELECT * FROM ${tableName} LIMIT 100;`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Share2 className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Compartilhar & Exportar</h3>
              <p className="text-xs text-slate-500">{sheet.name || 'Tabela de Dados'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Shareable Link */}
          <div>
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Globe className="size-3.5 text-blue-500" />
              <span>Link Público de Acesso</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-mono select-all focus:outline-hidden"
              />
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Quick Export Grid */}
          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-2">Exportações Rápidas</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => exportSheetToExcel(sheet, sheet.name)}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50/50 hover:border-emerald-200 transition-all text-left group cursor-pointer shadow-xs"
              >
                <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Excel (.XLSX)</div>
                  <div className="text-[10px] text-slate-500">Com Fórmulas OpenXML</div>
                </div>
              </button>

              <button
                onClick={handleExportJson}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-purple-50/50 hover:border-purple-200 transition-all text-left group cursor-pointer shadow-xs"
              >
                <div className="size-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Code className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">JSON Schema</div>
                  <div className="text-[10px] text-slate-500">Estrutura de dados</div>
                </div>
              </button>

              <button
                onClick={handleCopySql}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50/50 hover:border-indigo-200 transition-all text-left group cursor-pointer shadow-xs"
              >
                <div className="size-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Database className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Copiar Consulta SQL</div>
                  <div className="text-[10px] text-slate-500">{copiedSql ? 'SQL Copiado!' : 'DuckDB WASM'}</div>
                </div>
              </button>

              <button
                onClick={() => exportSheetToExcel(sheet, sheet.name)}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-amber-50/50 hover:border-amber-200 transition-all text-left group cursor-pointer shadow-xs"
              >
                <div className="size-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">CSV Delimitado</div>
                  <div className="text-[10px] text-slate-500">Padrão UTF-8</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3 text-emerald-600" />
            <span>Dados 100% locais no seu navegador</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
