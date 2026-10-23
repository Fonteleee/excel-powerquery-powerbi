// src/features/relations/ui/export/FlowExportSection.tsx
// Versão autônoma do menu para o modal de Importar/Exportar: lê o grafo salvo (localStorage) e, ao importar,
// grava de volta com `saveFlowGraph`. Quando a UI da Fase 1 estiver pronta, prefira `FlowExportMenu`
// com o grafo do estado dela (veja docs/FASE2_INTEGRACAO.md).

import React, { useState } from 'react';
import { Sheet } from '../../../../types/spreadsheet';
import { FlowGraph } from '../../model/graph';
import { loadFlowGraph, saveFlowGraph } from '../../model/persistence';
import { FlowExportMenu } from './FlowExportMenu';

export interface FlowExportSectionProps {
  sheets: readonly Sheet[];
}

export const FlowExportSection: React.FC<FlowExportSectionProps> = ({ sheets }) => {
  const [graph, setGraph] = useState<FlowGraph>(() => loadFlowGraph());
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3">
      <FlowExportMenu
        graph={graph}
        sheets={sheets}
        onImportGraph={imported => {
          saveFlowGraph(imported);
          setGraph(imported);
          setSaved(true);
        }}
      />
      {saved && (
        <p className="text-[11px] text-slate-500">
          Fluxo salvo no navegador. Reabra a aba Relacionamentos para vê-lo.
        </p>
      )}
    </div>
  );
};
