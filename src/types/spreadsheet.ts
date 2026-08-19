export interface CellPosition {
  row: number; // 0-indexed
  col: number; // 0-indexed
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type CellFormatType =
  | 'general'
  | 'text'
  | 'number'
  | 'currency'
  | 'currency_usd'
  | 'currency_eur'
  | 'percentage'
  | 'date'
  | 'time'
  | 'time_hh_mm'
  | 'time_hh_mm_ss'
  | 'time_duration'
  | 'time_minutes_label'
  | 'time_from_decimal_hours'
  | 'time_from_minutes'
  | 'time_from_seconds';



export interface CellBorder {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
  color?: string;
  style?: 'solid' | 'dashed' | 'double' | 'thick';
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textColor?: string;
  bgColor?: string;
  fontSize?: number; // pt
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  type?: CellFormatType;
  decimals?: number;
  border?: CellBorder;
  textCase?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
}

export interface CellData {
  raw: string; // e.g. "=PROCX(A2, B:B, C:C)" or "1500" or "João Silva"
  value: string | number | boolean | null; // calculated result
  format?: CellFormat;
  comment?: string;
  error?: string | null;
}

export interface MergedRegion {
  id: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type ConditionalRuleType =
  | 'highlight_greater'
  | 'highlight_less'
  | 'highlight_between'
  | 'highlight_equal'
  | 'highlight_text'
  | 'highlight_duplicate'
  | 'highlight_above_avg'
  | 'highlight_below_avg'
  | 'color_scale_2'
  | 'color_scale_3'
  | 'data_bar'
  | 'icon_set';

export interface ConditionalFormatRule {
  id: string;
  type: ConditionalRuleType;
  value1?: string | number;
  value2?: string | number;
  range: CellRange;
  style: {
    bgColor?: string;
    textColor?: string;
    iconSet?: 'traffic' | 'arrows' | 'stars' | 'flags';
    barColor?: string;
    minColor?: string;
    midColor?: string;
    maxColor?: string;
  };
}

export interface Sheet {
  id: string;
  name: string;
  data: { [key: string]: CellData }; // Key format: "R{row}C{col}"
  rowCount: number;
  colCount: number;
  colWidths: { [col: number]: number };
  rowHeights: { [row: number]: number };
  mergedRegions: MergedRegion[];
  conditionalRules: ConditionalFormatRule[];
  tabColor?: string;
  filterEnabled?: boolean;
  filters?: { [col: number]: string[] };
}


export interface WorkbookState {
  sheets: Sheet[];
  activeSheetId: string;
  activeCell: CellPosition;
  selectedRange: CellRange;
  clipboard: {
    range: CellRange;
    data: { [key: string]: CellData };
    isCut?: boolean;
  } | null;
  history: {
    past: Sheet[][];
    future: Sheet[][];
  };
}

export interface FormulaParamGuide {
  name: string;
  description: string;
  example: string;
  syntax: string;
  category: 'Busca e Referência' | 'Matemática e Estatística' | 'Texto' | 'Lógica' | 'Data e Hora';
  params: {
    name: string;
    description: string;
    optional?: boolean;
    defaultValue?: string;
  }[];
}
