// src/engine/formulas/functions/types.ts
// Contrato entre o avaliador e as funções de planilha (cada categoria vive em seu arquivo).

import { CellRange, Sheet } from '../../../types/spreadsheet';

/** Intervalo já resolvido (aba de destino + valores). Os valores são calculados sob demanda. */
export interface ResolvedRange {
  targetSheet: Sheet;
  range: CellRange;
  /** Valores em ordem de linha, depois coluna. */
  readonly flatValues: any[];
  /** Valores como matriz [linha][coluna]. */
  readonly matrixValues: any[][];
}

/** O que uma função de planilha pode pedir ao avaliador (evita dependência circular entre módulos). */
export interface FunctionContext {
  sheet: Sheet;
  allSheets: Sheet[];
  /** Avalia uma expressão (argumento) no contexto da célula atual. */
  evaluate(expr: string): any;
  /** Resolve um argumento de intervalo (local ou de outra aba); `null` se não for um intervalo. */
  resolve(arg: string): ResolvedRange | null;
  /** Lê o valor de uma célula (avaliando a fórmula se ainda não foi calculada). */
  getCell(sheet: Sheet, row: number, col: number): any;
}

export type FunctionHandler = (args: string[], ctx: FunctionContext) => any;
