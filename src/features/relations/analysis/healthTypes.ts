// src/features/relations/analysis/healthTypes.ts
// Tipos do Data Health HUD e das correções declarativas (HealthFix).

import { Sheet } from '../../../types/spreadsheet';
import { DateFormat } from './dates';

export type CellKind = 'number' | 'numericText' | 'date' | 'text' | 'boolean';

/** Correção DECLARATIVA: descreve o que fazer; `applyHealthFix` é quem executa (sem mutar). */
export type HealthFix =
  | { kind: 'trim_spaces'; columns: string[] }
  | { kind: 'standardize_type'; column: string; to: 'number' | 'text' }
  | { kind: 'normalize_dates'; column: string; to: DateFormat }
  | { kind: 'remove_duplicates' };

export interface ProposedFix {
  /** Estável entre análises da mesma planilha (serve de chave na UI). */
  id: string;
  fix: HealthFix;
  title: string;
  description: string;
  /** Células que seriam alteradas (ou removidas, no caso de duplicados). */
  affectedCells: number;
  affectedRows: number;
}

export interface ColumnHealth {
  index: number;
  header: string;
  filled: number;
  empty: number;
  emptyPercent: number;
  /** Células de texto com espaços sobrando (nas pontas ou repetidos). */
  whitespaceCells: number;
  kinds: Record<CellKind, number>;
  dominantKind: CellKind | null;
  mixedTypes: boolean;
  dateFormats: Partial<Record<DateFormat, number>>;
  dominantDateFormat: DateFormat | null;
  divergentDates: boolean;
}

export interface TableHealth {
  sheetId: string;
  sheetName: string;
  dataRows: number;
  columns: ColumnHealth[];
  /** Linhas sem espaço sobrando, sem tipo fora do padrão da coluna, sem data divergente e sem duplicata exata. */
  consistentRows: number;
  consistencyPercent: number;
  /** Células preenchidas / células possíveis. */
  completenessPercent: number;
  /** Linhas repetidas por completo (a partir da segunda ocorrência). */
  duplicateRows: number;
  /** Posições (base 0 entre as linhas de dados) das primeiras duplicatas. */
  duplicateRowSample: number[];
  fixes: ProposedFix[];
}

export interface FixPreview {
  /** Nova planilha; a original nunca é alterada. */
  sheet: Sheet;
  changedCells: number;
  removedRows: number;
  /** Motivos de partes não aplicadas (coluna inexistente, planilha com fórmulas...). */
  skipped: string[];
}
