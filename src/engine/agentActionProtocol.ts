import { CellFormat, CellRange } from '../types/spreadsheet';
import { CopilotChartConfig } from '../components/Copilot/CopilotChartCard';

export type AgentAction =
  | {
      type: 'create_sheet_from_scratch';
      sheetName: string;
      columns: string[];
      rows: (string | number | boolean | null)[][];
      formats?: Record<string, Partial<CellFormat>>;
      autoRecalculate?: boolean;
    }
  | {
      type: 'set_cells';
      cells: Array<{
        row: number;
        col: number;
        raw: string;
        format?: Partial<CellFormat>;
      }>;
    }
  | {
      type: 'delete_columns';
      colIndices: number[];
    }
  | {
      type: 'delete_rows';
      rowIndices: number[];
    }
  | {
      type: 'clear_range';
      range: CellRange;
      clearFormatting?: boolean;
    }
  | {
      type: 'format_range';
      range: CellRange;
      format: Partial<CellFormat>;
    }
  | {
      type: 'create_chart';
      config: CopilotChartConfig;
    }
  | {
      type: 'run_duckdb_sql';
      query: string;
      explanation?: string;
    };

export interface AgentExecutionPlan {
  summary: string;
  actions: AgentAction[];
  suggestedFormula?: string;
  suggestedMCode?: string;
  suggestedChart?: CopilotChartConfig;
  sqlQuery?: string;
}
