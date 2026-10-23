// src/features/relations/excel/sanitize.ts
// Defesa contra injeção de fórmula (CSV/Excel injection) em qualquer texto exportado para planilha.

const DANGEROUS_START = /^[=+\-@\t\r\n]/;

/**
 * Texto que começa com `=`, `+`, `-`, `@` (ou tab/quebra de linha, que o Excel também interpreta)
 * ganha o prefixo `'`, que o Excel exibe como texto literal.
 */
export function sanitizeSpreadsheetText(value: string): string {
  return DANGEROUS_START.test(value) ? `'${value}` : value;
}

/** Desfaz sanitizeSpreadsheetText (só quando o texto depois do ' seria perigoso). */
export function restoreSpreadsheetText(value: string): string {
  return value.startsWith("'") && DANGEROUS_START.test(value.slice(1)) ? value.slice(1) : value;
}

/** Aplica `sanitizeSpreadsheetText` a toda célula de texto de uma matriz; números e vazios passam. */
export function sanitizeRows(rows: readonly (readonly (string | number)[])[]): (string | number)[][] {
  return rows.map(row => row.map(cell => (typeof cell === 'string' ? sanitizeSpreadsheetText(cell) : cell)));
}
