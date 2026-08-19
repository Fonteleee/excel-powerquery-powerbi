export type AggregationType =
  | 'SUM'
  | 'AVERAGE'
  | 'COUNT'
  | 'COUNT_DISTINCT'
  | 'MIN'
  | 'MAX'
  | 'SUMPRODUCT'
  | 'WEIGHTED_AVG'
  | 'PERCENT_OF_TOTAL';

export interface PivotValueField {
  colIndex: number;
  colName: string;
  aggregation: AggregationType;
  customLabel?: string;
  weightColIndex?: number; // For WEIGHTED_AVG or SUMPRODUCT
}

export interface PivotConfig {
  rowFieldIndices: number[];
  columnFieldIndices: number[];
  valueFields: PivotValueField[];
  filterIndices: { [colIndex: number]: string[] }; // selected items to keep
  showRowTotals: boolean;
  showColumnTotals: boolean;
}

export interface PivotCell {
  value: number | string | null;
  formatted: string;
  isHeader?: boolean;
  isTotal?: boolean;
}

export interface PivotResult {
  headers: string[];
  subHeaders?: string[];
  rows: {
    label: string[];
    cells: PivotCell[];
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
  }[];
  summaryCardValues: { label: string; value: string | number; change?: string }[];
}

export type ChartType =
  | 'bar'
  | 'column'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'scatter';

export interface DynamicChartConfig {
  id: string;
  title: string;
  type: ChartType;
  categoryColIndex: number;
  valueColIndices: number[];
  aggregation: AggregationType;
  filterValue?: string | null; // For cross-filtering
  colorScheme: 'emerald' | 'blue' | 'indigo' | 'violet' | 'amber' | 'rainbow';
}

export interface KPICardData {
  id: string;
  title: string;
  value: string;
  subValue?: string;
  trend: number; // percentage +/-
  trendDirection: 'up' | 'down' | 'neutral';
  icon: 'trending-up' | 'dollar-sign' | 'users' | 'shopping-cart' | 'package' | 'activity' | 'pie-chart' | 'percent';
  sparklineData: number[];
  color: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose';
}
