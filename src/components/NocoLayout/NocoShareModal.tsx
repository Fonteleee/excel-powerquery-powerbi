import React, { useRef, useState } from 'react';
import {
  X,
  Share2,
  FileSpreadsheet,
  FileText,
  Code,
  Database,
  Download,
  Lock,
  Save,
  FolderOpen,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { exportSheetToExcel } from '../../utils/excelExporter';
import { notify } from '../../utils/notify';
import { appendableSheets, decodeProject, encodeProject, MAX_PROJECT_BYTES, ProjectEnvelope, PROJECT_EXTENSION } from '../../utils/projectFile';
import { applyProjectStorage, collectProjectData, OpenMode, pickPreferences } from '../../utils/projectApply';
import type { UserPreferences } from '../../utils/storageManager';

interface NocoShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  /** Projeto (.verxel): todas as abas, aba ativa e favoritas atuais. */
  sheets?: Sheet[];
  activeSheetId?: string;
  starredSheetIds?: Iterable<string>;
  /** Chamado ao abrir um projeto: o App só precisa guardar estes valores no estado. */
  onApplyProject?: (next: { sheets: Sheet[]; activeSheetId: string; starredSheetIds: string[]; preferences: UserPreferences; mode: OpenMode }) => void;
}

export const NocoShareModal: React.FC<NocoShareModalProps> = ({
  isOpen,
  onClose,
  sheet,
  sheets,
  activeSheetId,
  starredSheetIds,
  onApplyProject,
}) => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [pending, setPending] = useState<{ project: ProjectEnvelope; fileName: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const allSheets = sheets && sheets.length > 0 ? sheets : [sheet];

  const handleSaveProject = async () => {
    try {
      const data = collectProjectData(allSheets, activeSheetId ?? sheet.id, starredSheetIds ?? []);
      const { bytes, compressed } = await encodeProject(data);
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projeto-verxel-${new Date().toISOString().slice(0, 10)}${PROJECT_EXTENSION}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Projeto salvo (${allSheets.length} ${allSheets.length === 1 ? 'aba' : 'abas'}${compressed ? ', compactado' : ''}).`, 'success');
    } catch {
      notify('Não foi possível salvar o projeto.', 'error');
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PROJECT_BYTES) {
      notify('Arquivo grande demais para abrir.', 'error');
      return;
    }
    try {
      const result = await decodeProject(new Uint8Array(await file.arrayBuffer()));
      if (!result.ok) {
        notify(result.error, 'error');
        return;
      }
      setPending({ project: result.project, fileName: file.name });
    } catch {
      notify('Não foi possível ler o arquivo.', 'error');
    }
  };

  const confirmOpen = (mode: OpenMode) => {
    if (!pending || !onApplyProject) return;
    const { project } = pending;
    const next = mode === 'replace' ? project.sheets : [...allSheets, ...appendableSheets(allSheets, project.sheets)];
    const added = mode === 'replace' ? project.sheets.length : next.length - allSheets.length;
    applyProjectStorage(project, mode);
    onApplyProject({
      sheets: next,
      activeSheetId: mode === 'replace' ? project.activeSheetId : next[allSheets.length]?.id ?? (activeSheetId ?? sheet.id),
      starredSheetIds: mode === 'replace' ? project.starredSheetIds : [...(starredSheetIds ?? [])],
      preferences: mode === 'replace' ? pickPreferences(project.preferences) : {},
      mode,
    });
    setPending(null);
    onClose();
    notify(mode === 'replace' ? `Projeto aberto (${added} abas).` : `${added} abas acrescentadas ao projeto atual.`, 'success');
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

          {/* Projeto .verxel */}
          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-2">Projeto completo</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleSaveProject}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all text-left group cursor-pointer shadow-xs"
              >
                <div className="size-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Save className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Salvar projeto (.verxel)</div>
                  <div className="text-[10px] text-slate-500">Abas, fluxo e preferências</div>
                </div>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!onApplyProject}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-teal-50/50 hover:border-teal-200 transition-all text-left group cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="size-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FolderOpen className="size-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Abrir projeto…</div>
                  <div className="text-[10px] text-slate-500">Arquivo .verxel</div>
                </div>
              </button>
            </div>
            <input ref={fileRef} type="file" accept={`${PROJECT_EXTENSION},application/octet-stream`} className="hidden" onChange={handleFileChosen} />
          </div>

          {pending && (
            <div role="dialog" aria-label="Abrir projeto" className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 space-y-2">
              <div className="text-xs text-slate-800">
                <span className="font-bold">{pending.fileName}</span> tem {pending.project.sheets.length}{' '}
                {pending.project.sheets.length === 1 ? 'aba' : 'abas'}. O que fazer?
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => confirmOpen('replace')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Substituir tudo
                </button>
                <button
                  onClick={() => confirmOpen('append')}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Acrescentar abas
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-[10px] text-slate-500">"Substituir tudo" troca as abas, o fluxo de Relacionamentos e as preferências atuais.</p>
            </div>
          )}
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
