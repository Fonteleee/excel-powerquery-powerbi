export type RelationFormulaType =
  | 'PROCX'
  | 'SUM_COLS'
  | 'SUB_COLS'
  | 'MULT_COLS'
  | 'DIV_COLS'
  | 'PCT_DIFF'
  | 'CONCAT'
  | 'IF_COMPARE'
  | 'ROW_LAG'
  | 'RUNNING_TOTAL'
  | 'SOMASE'
  | 'CONT.SE'
  | 'MEDIASE'
  | 'FILTRO'
  | 'UNIRTEXTO'
  | 'PROCV'
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
  compareOperator?: '>' | '>=' | '<' | '<=' | '=' | '<>';
  ifTrueValue?: string;
  ifFalseValue?: string;
  createdAt: number;
}

export interface CanvasViewport {
  zoom: number; // 0.4 to 2.0
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
