// src/engine/formulaParser.ts
// Fachada pública do motor de fórmulas. O código vive em módulos coesos (todos < 1000 linhas):
//   formulas/addressing   endereços A1, chaves "R{row}C{col}" e deslocamento de fórmulas
//   formulas/numbers      números PT-BR/US, comparação estilo Excel, tempo em segundos
//   formulas/formatting   formatação de valores para exibição
//   formulas/catalog      catálogo documentado das fórmulas
//   formulas/tokenizer    divisão de argumentos/operadores
//   formulas/evaluator    avaliação de expressões e leitura de células/intervalos
//   formulas/functions/*  funções de planilha por categoria
//   recalc/*              recálculo (grafo de dependências, matrizes dinâmicas, caminho legado)
// Os importadores continuam usando `import { ... } from '.../formulaParser'` sem mudanças.

export type { FormulaParamGuide } from '../types/spreadsheet';
export * from './formulas/addressing';
export { FORMULA_CATALOG } from './formulas/catalog';
export { parseNumberSafely, valuesMatch, valueToSeconds } from './formulas/numbers';
export { formatCellValue, formatSecondsToTime } from './formulas/formatting';
export {
  evaluateFormula,
  getCellValue,
  getFlatRangeValues,
  getRangeValues,
  resolveRangeAndValues,
} from './formulas/evaluator';
export { recalculateSheet } from './recalc/recalculate';
