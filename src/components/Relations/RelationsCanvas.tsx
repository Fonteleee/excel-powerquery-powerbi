// src/components/Relations/RelationsCanvas.tsx
// Fachada fina: a aba de Relacionamentos agora vive em src/features/relations/ui (grafo declarativo como fonte da verdade).
// Mantém o nome e as props antigas para que o App e outros pontos de entrada continuem funcionando.

import React from 'react';
import { Sheet } from '../../types/spreadsheet';
import { FlowCanvas } from '../../features/relations/ui/FlowCanvas';

interface RelationsCanvasProps {
  sheets: Sheet[];
  activeSheet?: Sheet;
  onUpdateSheets: (newSheets: Sheet[]) => void;
  onNavigateView?: (view: 'spreadsheet' | 'powerquery' | 'powerbi' | 'relations') => void;
  onOpenShare?: () => void;
  onOpenCopilot?: () => void;
  onOpenImportModal?: () => void;
  /** Abre uma aba na grade de dados (usado pelo botão "Ver na aba Dados"). */
  onOpenSheet?: (sheetId: string) => void;
}

export const RelationsCanvas: React.FC<RelationsCanvasProps> = ({
  sheets,
  onUpdateSheets,
  onOpenCopilot,
  onOpenImportModal,
  onOpenSheet,
}) => (
  <FlowCanvas
    sheets={sheets}
    onUpdateSheets={onUpdateSheets}
    onOpenCopilot={onOpenCopilot}
    onOpenImportModal={onOpenImportModal}
    onOpenSheet={onOpenSheet}
  />
);
