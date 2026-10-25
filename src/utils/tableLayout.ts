// src/utils/tableLayout.ts
// Entende a "forma" de uma planilha importada: onde está o cabeçalho de verdade e onde a tabela termina.
// Relatórios costumam ter título e observações acima da tabela, linhas em branco e outros blocos abaixo.

export type RawValue = string | number | boolean | null | undefined;

const MAX_SCAN_ROWS = 40;

export const isFilled = (value: RawValue): boolean => value !== null && value !== undefined && String(value).trim() !== '';

export const filledCount = (row: readonly RawValue[] | undefined): number => (row ? row.filter(isFilled).length : 0);

const isNumericLike = (value: RawValue): boolean => {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  return /^-?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d+)?\s*%?$|^-?\d+(?:[.,]\d+)?\s*%?$/.test(value.trim());
};

/** Fração de células preenchidas da linha que são texto (cabeçalhos são quase sempre texto). */
function textRatio(row: readonly RawValue[]): number {
  const filled = row.filter(isFilled);
  if (filled.length === 0) return 0;
  return filled.filter(v => !isNumericLike(v)).length / filled.length;
}

/**
 * Índice (base 0) da linha de cabeçalho: a primeira linha larga (quase tão larga quanto a maior das primeiras
 * linhas), de texto, seguida por uma linha de dados também com mais de uma célula. Se nada serve, é a linha 0.
 */
export function detectHeaderRow(rows: readonly (readonly RawValue[])[]): number {
  const scan = rows.slice(0, MAX_SCAN_ROWS);
  const widest = Math.max(0, ...scan.map(filledCount));
  if (widest < 2) return 0;
  const needed = Math.max(2, Math.ceil(widest * 0.6));

  for (let r = 0; r < scan.length; r++) {
    const row = scan[r];
    if (filledCount(row) < needed || textRatio(row) < 0.6) continue;
    const next = rows[r + 1];
    if (next && filledCount(next) >= 2) return r;
  }
  return 0;
}

/** Última linha do bloco de dados que começa logo abaixo do cabeçalho (vai até a primeira linha em branco). */
export function tableBlockEnd(rows: readonly (readonly RawValue[])[], headerRow: number): number {
  let end = headerRow;
  for (let r = headerRow + 1; r < rows.length; r++) {
    if (filledCount(rows[r]) === 0) break;
    end = r;
  }
  return end;
}

/** Linhas de título/observação: só uma célula preenchida, antes da tabela ou depois de uma linha em branco. */
export function isSingleCellRow(row: readonly RawValue[] | undefined): boolean {
  return filledCount(row) === 1;
}
