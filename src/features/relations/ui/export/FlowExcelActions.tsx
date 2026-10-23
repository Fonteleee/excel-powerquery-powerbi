// src/features/relations/ui/export/FlowExcelActions.tsx
// "Exportar com aba de fluxo" (xlsx com a aba oculta _Flow_v1) e "Importar fluxo de Excel".

import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Sheet } from '../../../../types/spreadsheet';
import { exportSheetToExcel } from '../../../../utils/excelExporter';
import { FlowGraph } from '../../model/graph';
import { importFlowFromFile, safeFileName } from './exportActions';

export interface FlowExcelActionsProps {
  graph: FlowGraph;
  sheets: readonly Sheet[];
  /** Chamado com o grafo já validado quando o usuário confirma a importação. */
  onImportGraph: (graph: FlowGraph) => void;
  fileBase?: string;
}

interface Pending {
  graph: FlowGraph;
  warnings: string[];
}

const buttonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export const FlowExcelActions: React.FC<FlowExcelActionsProps> = ({ graph, sheets, onImportGraph, fileBase = 'fluxo' }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const handleExport = () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      exportSheetToExcel([...sheets], safeFileName(fileBase, 'xlsx'), graph);
      setNotice('Arquivo gerado com a aba oculta _Flow_v1.');
    } catch {
      setErrors(['Não foi possível gerar o arquivo do Excel.']);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setErrors([]);
    setNotice(null);
    setPending(null);
    try {
      const outcome = await importFlowFromFile(file, sheets);
      if (!outcome.ok) {
        setErrors(outcome.errors);
      } else if (outcome.modified || outcome.warnings.length > 0) {
        setPending({ graph: outcome.graph, warnings: outcome.warnings });
      } else {
        onImportGraph(outcome.graph);
        setNotice('Fluxo importado.');
      }
    } catch {
      setErrors(['Não foi possível ler o arquivo.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Fluxo no Excel" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={handleExport}>
          <Download className="size-3.5" />
          Exportar com aba de fluxo
        </button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload className="size-3.5" />
          Importar fluxo de Excel
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={handleFile}
          aria-label="Escolher arquivo do Excel com aba de fluxo"
        />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 rounded-lg border border-red-200 bg-red-50 p-3 pl-6 text-xs text-red-800">
          {errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      )}

      {pending && (
        <div role="alertdialog" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ul className="list-disc space-y-0.5 pl-4">
            {pending.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                onImportGraph(pending.graph);
                setPending(null);
                setNotice('Fluxo importado.');
              }}
            >
              Importar mesmo assim
            </button>
            <button type="button" className={buttonClass} onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {notice && <p className="text-xs text-emerald-800">{notice}</p>}
    </section>
  );
};
