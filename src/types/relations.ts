export type RelationFormulaType =
  | 'PROCX'
  | 'PROCV'
  | 'SOMASE'
  | 'CONT.SE'
  | 'MEDIASE'
  | 'FILTRO'
  | 'UNIRTEXTO'
  | 'JOIN_ETL';

export type RelationOutputDestination =
  | 'next_column'
  | 'new_sheet'
  | 'below_row'
  | 'specific_cell';

export interface RelationNode {
  id: string; // sheetId
  sheetId: string;
  sheetName: string;
  x: number;
  y: number;
  isCollapsed?: boolean;
}

export interface RelationEdge {
  id: string;
  sourceSheetId: string;
  sourceColIdx: number;
  targetSheetId: string;
  targetColIdx: number;
  formulaType: RelationFormulaType;
  returnColIdx: number;
  outputDestination: RelationOutputDestination;
  customColName?: string;
  delimiter?: string;
  ifNotFound?: string;
  createdAt: number;
}

export interface CanvasViewport {
  zoom: number; // 0.5 to 2.0
  panX: number;
  panY: number;
}

export interface ConnectionDraft {
  sourceSheetId: string;
  sourceColIdx: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}
