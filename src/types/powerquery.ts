export type QueryStepType =
  | 'source'
  | 'filter_rows'
  | 'change_type'
  | 'detect_data_types'
  | 'split_column'
  | 'merge_columns'
  | 'replace_value'
  | 'remove_nulls'
  | 'remove_duplicates'
  | 'add_column'
  | 'add_custom_column'
  | 'add_conditional_column'
  | 'add_index_column'
  | 'duplicate_column'
  | 'extract_text'
  | 'group_by'
  | 'uppercase'
  | 'lowercase'
  | 'propercase'
  | 'trim'
  | 'flash_fill'
  | 'unpivot';

export interface QueryStep {
  id: string;
  name: string;
  type: QueryStepType;
  params: Record<string, any>;
  description: string;
  timestamp: number;
}

export interface ColumnProfile {
  colIndex: number;
  colName: string;
  totalCount: number;
  validCount: number;
  emptyCount: number;
  errorCount: number;
  distinctCount: number;
  inferredType: 'number' | 'text' | 'date' | 'time' | 'currency' | 'percentage' | 'boolean';
  min?: number | string;
  max?: number | string;
  avg?: number;
  sum?: number;
  topValues: { value: string; count: number; percentage: number }[];
}

export interface PowerQueryState {
  steps: QueryStep[];
  activeStepId: string;
  isApplied: boolean;
}

