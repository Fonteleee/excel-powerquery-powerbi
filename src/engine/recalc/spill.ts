// src/engine/recalc/spill.ts
// Matrizes dinâmicas: grava o resultado de uma fórmula na célula e "derrama" matrizes nas vizinhas.
// Funções puras sobre o mapa `data` de uma aba (o chamador decide quando copiar o mapa).

import { CellData, CellRange } from '../../types/spreadsheet';
import { cellPosToKey } from '../formulas/addressing';

/** Erro de matriz dinâmica bloqueada (Excel pt-BR: #DESPEJAR!, equivalente ao #SPILL!). */
export const SPILL_ERROR = '#DESPEJAR!';

export interface WriteOutcome {
  /** Extensão derramada (ou pretendida, se bloqueada); `undefined` para resultados escalares. */
  spill?: CellRange;
  blocked: boolean;
  /** Chaves de células além da origem que foram limpas ou escritas (para notificar dependentes). */
  touched: string[];
}

const isFormulaRaw = (raw: unknown): boolean => typeof raw === 'string' && raw.startsWith('=');

/** Converte o resultado de uma função (vetor ou matriz) em matriz de linhas. */
export function asMatrix(result: unknown[]): any[][] {
  return Array.isArray(result[0]) ? (result as any[][]) : result.map(item => [item]);
}

/** Remove as células derramadas por `parentKey` dentro de `range`. Devolve as chaves removidas. */
export function clearSpillCells(data: Record<string, CellData>, parentKey: string, range: CellRange | undefined): string[] {
  const cleared: string[] = [];
  if (!range) return cleared;
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const key = cellPosToKey(r, c);
      const cell = data[key];
      if (cell && cell.isSpill && cell.spillParent === parentKey) {
        delete data[key];
        cleared.push(key);
      }
    }
  }
  return cleared;
}

/** Remove TODAS as células derramadas da aba (início de um recálculo completo). */
export function clearAllSpillCells(data: Record<string, CellData>): void {
  for (const key of Object.keys(data)) {
    if (data[key].isSpill) delete data[key];
  }
}

/**
 * Grava o resultado da fórmula de `key` (posição `row`/`col`) em `data`.
 * - Escalar: grava valor (ou erro, quando o texto começa com "#").
 * - Matriz: grava o primeiro valor na origem e derrama o resto; se alguma célula de destino estiver
 *   ocupada por conteúdo digitado (ou por outra matriz), grava #DESPEJAR! e não derrama nada.
 * A extensão derramada anterior desta fórmula (se existir) é limpa antes.
 */
export function writeFormulaResult(
  data: Record<string, CellData>,
  key: string,
  row: number,
  col: number,
  cell: CellData,
  val: unknown
): WriteOutcome {
  const touched = clearSpillCells(data, key, cell.spillRange);

  if (Array.isArray(val) && val.length > 0) {
    const matrix = asMatrix(val);
    const numRows = matrix.length;
    const numCols = matrix[0]?.length || 1;

    if (numRows > 1 || numCols > 1) {
      const spill: CellRange = { startRow: row, startCol: col, endRow: row + numRows - 1, endCol: col + numCols - 1 };

      let blocked = false;
      for (let r = 0; r < numRows && !blocked; r++) {
        for (let c = 0; c < numCols; c++) {
          if (r === 0 && c === 0) continue;
          const existing = data[cellPosToKey(row + r, col + c)];
          if (!existing) continue;
          const typed = !existing.isSpill && existing.raw && existing.raw !== '';
          const foreign = existing.isSpill && existing.spillParent !== key;
          if (typed || foreign) {
            blocked = true;
            break;
          }
        }
      }

      if (blocked) {
        data[key] = { ...cell, value: SPILL_ERROR, error: SPILL_ERROR, spillRange: spill };
        return { spill, blocked: true, touched };
      }

      data[key] = { ...cell, value: matrix[0][0], error: null, spillRange: spill };
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (r === 0 && c === 0) continue;
          const targetKey = cellPosToKey(row + r, col + c);
          data[targetKey] = { raw: '', value: matrix[r][c], isSpill: true, spillParent: key };
          touched.push(targetKey);
        }
      }
      return { spill, blocked: false, touched };
    }

    const scalar = Array.isArray(val[0]) ? val[0][0] : val[0];
    data[key] = { ...cell, value: scalar as CellData['value'], error: null, spillRange: undefined };
    return { blocked: false, touched };
  }

  data[key] = {
    ...cell,
    value: val as CellData['value'],
    error: typeof val === 'string' && val.startsWith('#') ? val : null,
    spillRange: undefined,
  };
  return { blocked: false, touched };
}

/** Indica se o texto bruto da célula é uma fórmula. */
export const isFormula = isFormulaRaw;
