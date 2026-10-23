// src/features/relations/ui/export/SqlExportPanel.tsx
// "Exportar fluxo como SQL": escolha de dialeto, pré-visualização, copiar e baixar .sql.
// Recebe tudo por props (não depende dos componentes da aba de Relacionamentos).

import React, { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Sheet } from '../../../../types/spreadsheet';
import { FlowGraph } from '../../model/graph';
import { OutputMode, SQL_DIALECTS, SqlDialectId } from '../../sql';
import { buildSqlScript, copyToClipboard, downloadTextFile, SqlScriptResult } from './exportActions';

export interface SqlExportPanelProps {
  graph: FlowGraph;
  sheets: readonly Sheet[];
  /** Base do nome do arquivo baixado (é sanitizada). */
  fileBase?: string;
}

const selectClass = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800';
const buttonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export const SqlExportPanel: React.FC<SqlExportPanelProps> = ({ graph, sheets, fileBase = 'fluxo' }) => {
  const [dialect, setDialect] = useState<SqlDialectId>('duckdb');
  const [outputMode, setOutputMode] = useState<OutputMode>('select');
  const [includeInputs, setIncludeInputs] = useState(true);
  const [result, setResult] = useState<SqlScriptResult | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = (next?: { dialect?: SqlDialectId; outputMode?: OutputMode; includeInputs?: boolean }) => {
    setCopied(false);
    setResult(
      buildSqlScript(graph, sheets, {
        dialect: next?.dialect ?? dialect,
        outputMode: next?.outputMode ?? outputMode,
        includeInputs: next?.includeInputs ?? includeInputs,
        fileBase,
      })
    );
  };

  const handleCopy = async () => {
    if (result?.ok) setCopied(await copyToClipboard(result.sql));
  };

  return (
    <section aria-label="Exportar fluxo como SQL" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
          Dialeto
          <select
            className={selectClass}
            value={dialect}
            onChange={e => {
              const value = e.target.value as SqlDialectId;
              setDialect(value);
              if (result) generate({ dialect: value });
            }}
          >
            {SQL_DIALECTS.map(d => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
          Saída
          <select
            className={selectClass}
            value={outputMode}
            onChange={e => {
              const value = e.target.value as OutputMode;
              setOutputMode(value);
              if (result) generate({ outputMode: value });
            }}
          >
            <option value="select">SELECT (mostra o resultado)</option>
            <option value="create_table">CREATE TABLE ... AS (grava a aba)</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 pb-1.5 text-[11px] font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={includeInputs}
            onChange={e => {
              setIncludeInputs(e.target.checked);
              if (result) generate({ includeInputs: e.target.checked });
            }}
          />
          Incluir dados de entrada
        </label>

        <button type="button" className={buttonClass} onClick={() => generate()}>
          Gerar SQL
        </button>
      </div>

      {result && !result.ok && (
        <ul role="alert" className="list-disc space-y-0.5 rounded-lg border border-red-200 bg-red-50 p-3 pl-6 text-xs text-red-800">
          {result.errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      )}

      {result?.ok && (
        <>
          {result.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-6 text-xs text-amber-900">
              {result.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
          {/* O SQL é exibido como texto: o React escapa tudo, não há HTML injetado. */}
          <pre
            className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100"
            aria-label={`Pré-visualização do SQL (${result.dialectLabel})`}
          >
            {result.preview}
          </pre>
          {result.truncated && (
            <p className="text-[11px] text-slate-500">
              Pré-visualização cortada; o arquivo baixado e o texto copiado contêm o script completo.
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={handleCopy}>
              <Copy className="size-3.5" />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" className={buttonClass} onClick={() => downloadTextFile(result.fileName, result.sql)}>
              <Download className="size-3.5" />
              Baixar {result.fileName}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
