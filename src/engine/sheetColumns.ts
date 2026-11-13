// src/engine/sheetColumns.ts
// Quais colunas da planilha têm alguma célula. Planilhas largas (até XFD = 16384 colunas) quase sempre têm
// milhares de colunas vazias; varrer linha × coluna em todas elas custa minutos. Quem só precisa do que existe
// percorre estas colunas e ignora as outras. Custa uma passada pelas células (milissegundos), sem cache: nunca fica velho.

import { Sheet } from '../types/spreadsheet';

/** Colunas (em ordem) que têm pelo menos uma célula em `sheet.data`. */
export function dataColumns(sheet: Pick<Sheet, 'data'>): number[] {
  const seen = new Set<number>();
  for (const key in sheet.data) {
    const at = key.indexOf('C', 1);
    if (at > 0) seen.add(Number(key.slice(at + 1)));
  }
  return [...seen].sort((a, b) => a - b);
}

/** Linhas de dados (sem o cabeçalho) que têm algum conteúdo: é o que o usuário entende por "registros". */
const rowCountCache = new WeakMap<object, number>();

export function countDataRows(sheet: Pick<Sheet, 'data'>): number {
  const cached = rowCountCache.get(sheet.data);
  if (cached !== undefined) return cached;
  const rows = new Set<number>();
  for (const key in sheet.data) {
    const cell = sheet.data[key];
    if (cell.raw === '' && (cell.value === '' || cell.value === null || cell.value === undefined)) continue;
    const row = Number(key.slice(1, key.indexOf('C', 1)));
    if (row > 0) rows.add(row);
  }
  rowCountCache.set(sheet.data, rows.size);
  return rows.size;
}
