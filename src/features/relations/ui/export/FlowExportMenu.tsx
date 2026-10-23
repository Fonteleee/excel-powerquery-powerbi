// src/features/relations/ui/export/FlowExportMenu.tsx
// Menu único das exportações da Fase 2. Plugue-o na UI de Relacionamentos passando o grafo e as planilhas.

import React from 'react';
import { Sheet } from '../../../../types/spreadsheet';
import { FlowGraph } from '../../model/graph';
import { FlowExcelActions } from './FlowExcelActions';
import { SqlExportPanel } from './SqlExportPanel';

export interface FlowExportMenuProps {
  graph: FlowGraph;
  sheets: readonly Sheet[];
  /** Recebe o grafo importado (já validado e religado às planilhas abertas pelo nome). */
  onImportGraph: (graph: FlowGraph) => void;
  fileBase?: string;
  className?: string;
}

export const FlowExportMenu: React.FC<FlowExportMenuProps> = ({ graph, sheets, onImportGraph, fileBase, className }) => (
  <div className={className ?? 'space-y-5'}>
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Exportar fluxo como SQL</h4>
      <SqlExportPanel graph={graph} sheets={sheets} fileBase={fileBase} />
    </div>
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Fluxo no Excel</h4>
      <FlowExcelActions graph={graph} sheets={sheets} onImportGraph={onImportGraph} fileBase={fileBase} />
    </div>
  </div>
);
