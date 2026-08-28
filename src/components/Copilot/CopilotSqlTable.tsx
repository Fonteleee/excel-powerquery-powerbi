import React, { useState } from 'react';
import { Database, Copy, Check, Table, PlusCircle, Clock } from 'lucide-react';
import { DuckDBQueryResult } from '../../engine/duckdbEngine';

interface CopilotSqlTableProps {
  queryResult: DuckDBQueryResult;
  sqlQuery?: string;
  onExportToNewSheet?: (tableName: string, columns: string[], rows: any[]) => void;
}

export const CopilotSqlTable: React.FC<CopilotSqlTableProps> = ({
  queryResult,
  sqlQuery,
  onExportToNewSheet,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExported, setIsExported] = useState(false);

  const handleCopySql = () => {
    if (sqlQuery) {
      navigator.clipboard.writeText(sqlQuery);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = () => {
    if (onExportToNewSheet && queryResult.columns.length > 0) {
      onExportToNewSheet('Consulta DuckDB', queryResult.columns, queryResult.rows);
      setIsExported(true);
      setTimeout(() => setIsExported(false), 3000);
    }
  };

  if (queryResult.error) {
    return (
      <div className="my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        <div className="flex items-center gap-1.5 font-semibold text-red-800 mb-1">
          <Database className="size-3.5" /> Erro na execução DuckDB SQL
        </div>
        <p className="font-mono">{queryResult.error}</p>
      </div>
    );
  }

  if (queryResult.columns.length === 0) return null;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header com KPIs e Ações */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <Database className="size-3.5 text-blue-600" />
          <span>Resultado DuckDB-Wasm</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            {queryResult.rowCount} linhas
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="size-3 text-emerald-600" />
            {queryResult.executionTimeMs}ms
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {sqlQuery && (
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Copiar consulta SQL"
            >
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              <span>{copied ? 'Copiado' : 'SQL'}</span>
            </button>
          )}

          {onExportToNewSheet && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              {isExported ? <Check className="size-3" /> : <PlusCircle className="size-3" />}
              <span>{isExported ? 'Criado!' : 'Nova Aba'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-semibold text-slate-600 sticky top-0">
              {queryResult.columns.map((col, idx) => (
                <th key={idx} className="px-3 py-1.5 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
            {queryResult.rows.slice(0, 50).map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                {queryResult.columns.map((col, cIdx) => {
                  const val = row[col];
                  const displayVal = val === null || val === undefined ? '-' : String(val);
                  return (
                    <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                      {displayVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {queryResult.rowCount > 50 && (
        <div className="bg-slate-50 px-3 py-1.5 text-center text-[10px] text-slate-500 border-t border-slate-100">
          Exibindo as primeiras 50 de {queryResult.rowCount} linhas.
        </div>
      )}
    </div>
  );
};
