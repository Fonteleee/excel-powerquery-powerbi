// src/engine/__bench__/syntheticSheets.ts
// Gera planilhas sintéticas determinísticas (PRNG com semente fixa) para medir o motor de fórmulas.

import { CellData, Sheet } from '../../types/spreadsheet';

/** PRNG mulberry32: mesma semente, mesma planilha, em qualquer máquina. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (row: number, col: number): string => `R${row}C${col}`;

function emptySheet(id: string, name: string, rowCount: number, colCount: number): Sheet {
  return {
    id,
    name,
    data: {},
    rowCount,
    colCount,
    colWidths: {},
    rowHeights: {},
    mergedRegions: [],
    conditionalRules: [],
  };
}

const text = (value: string): CellData => ({ raw: value, value });
const num = (value: number): CellData => ({ raw: String(value), value });
/** Fórmula ainda não calculada (como chega de uma importação ou de uma edição). */
const formula = (raw: string): CellData => ({ raw, value: null });

export interface Scenario {
  name: string;
  description: string;
  /** Planilhas do workbook. */
  sheets: Sheet[];
  /** Id da planilha que é recalculada. */
  targetId: string;
  /** Edição pontual usada nos testes de recálculo incremental (célula de entrada). */
  edit?: { sheetId: string; row: number; col: number; raw: string };
}

/** Linhas independentes: E = C*D, F = E*1,1 e uma linha de totais com SOMA de coluna inteira. */
export function independentRows(rows: number): Scenario {
  const rng = createRng(42);
  const sheet = emptySheet('vendas', 'Vendas', rows + 3, 8);
  sheet.data[key(0, 0)] = text('ID');
  sheet.data[key(0, 1)] = text('Produto');
  sheet.data[key(0, 2)] = text('Qtd');
  sheet.data[key(0, 3)] = text('Preço');
  sheet.data[key(0, 4)] = text('Total');
  sheet.data[key(0, 5)] = text('Com imposto');
  for (let r = 1; r <= rows; r++) {
    sheet.data[key(r, 0)] = text(`ID-${r}`);
    sheet.data[key(r, 1)] = text(`Produto ${r % 50}`);
    sheet.data[key(r, 2)] = num(1 + Math.floor(rng() * 50));
    sheet.data[key(r, 3)] = num(Math.round((10 + rng() * 990) * 100) / 100);
    sheet.data[key(r, 4)] = formula(`=C${r + 1}*D${r + 1}`);
    sheet.data[key(r, 5)] = formula(`=E${r + 1}*1.1`);
  }
  sheet.data[key(rows + 1, 4)] = formula(`=SOMA(E2:E${rows + 1})`);
  sheet.data[key(rows + 1, 5)] = formula(`=SOMA(F2:F${rows + 1})`);
  return {
    name: `linhas-independentes-${rows}`,
    description: `${rows} linhas com 2 fórmulas por linha e 2 totais de coluna`,
    sheets: [sheet],
    targetId: 'vendas',
    edit: { sheetId: 'vendas', row: Math.floor(rows / 2), col: 2, raw: '99' },
  };
}

/** Cadeia: B2 = B1+1, B3 = B2+1, ... (pior caso para quem recalcula por recursão ou por varredura). */
export function formulaChain(length: number): Scenario {
  const sheet = emptySheet('cadeia', 'Cadeia', length + 2, 4);
  sheet.data[key(0, 0)] = num(1);
  for (let r = 1; r < length; r++) {
    sheet.data[key(r, 0)] = formula(`=A${r}+1`);
  }
  sheet.data[key(length, 0)] = formula(`=SOMA(A1:A${length})`);
  return {
    name: `cadeia-${length}`,
    description: `cadeia de ${length} fórmulas dependentes e um total`,
    sheets: [sheet],
    targetId: 'cadeia',
    edit: { sheetId: 'cadeia', row: 0, col: 0, raw: '5' },
  };
}

/** PROCX, PROCV e SOMASE entre abas: Dados consulta Cadastro por categoria. */
export function crossSheetLookups(rows: number, catalogSize: number): Scenario {
  const rng = createRng(7);
  const catalog = emptySheet('cadastro', 'Cadastro', catalogSize + 2, 4);
  catalog.data[key(0, 0)] = text('Categoria');
  catalog.data[key(0, 1)] = text('Nome');
  catalog.data[key(0, 2)] = text('Desconto');
  for (let r = 1; r <= catalogSize; r++) {
    catalog.data[key(r, 0)] = text(`CAT-${r}`);
    catalog.data[key(r, 1)] = text(`Categoria número ${r}`);
    catalog.data[key(r, 2)] = num(Math.round(rng() * 30) / 100);
  }

  const data = emptySheet('dados', 'Dados', rows + 2, 8);
  data.data[key(0, 0)] = text('ID');
  data.data[key(0, 1)] = text('Categoria');
  data.data[key(0, 2)] = text('Valor');
  data.data[key(0, 3)] = text('Nome (PROCX)');
  data.data[key(0, 4)] = text('Desconto (PROCV)');
  data.data[key(0, 5)] = text('Soma desc. (SOMASE)');
  for (let r = 1; r <= rows; r++) {
    const cat = 1 + Math.floor(rng() * catalogSize);
    data.data[key(r, 0)] = text(`L-${r}`);
    data.data[key(r, 1)] = text(`CAT-${cat}`);
    data.data[key(r, 2)] = num(Math.round(rng() * 100000) / 100);
    data.data[key(r, 3)] = formula(`=PROCX(B${r + 1}, Cadastro!A:A, Cadastro!B:B, "?")`);
    data.data[key(r, 4)] = formula(`=PROCV(B${r + 1}, Cadastro!A2:C${catalogSize + 1}, 3, FALSO)`);
    data.data[key(r, 5)] = formula(`=SOMASE(Cadastro!A:A, B${r + 1}, Cadastro!C:C)`);
  }
  return {
    name: `lookups-entre-abas-${rows}x${catalogSize}`,
    description: `${rows} linhas com PROCX + PROCV + SOMASE sobre um cadastro de ${catalogSize} linhas em outra aba`,
    sheets: [data, catalog],
    targetId: 'dados',
    edit: { sheetId: 'cadastro', row: 5, col: 1, raw: 'Renomeada' },
  };
}

/** Total acumulado: C2 = SOMA($B$2:B2). Cada intervalo é diferente (caso difícil para índices de intervalo). */
export function runningTotals(rows: number): Scenario {
  const rng = createRng(11);
  const sheet = emptySheet('acum', 'Acumulado', rows + 2, 4);
  sheet.data[key(0, 0)] = text('Mês');
  sheet.data[key(0, 1)] = text('Valor');
  sheet.data[key(0, 2)] = text('Acumulado');
  for (let r = 1; r <= rows; r++) {
    sheet.data[key(r, 0)] = text(`M${r}`);
    sheet.data[key(r, 1)] = num(Math.round(rng() * 1000));
    sheet.data[key(r, 2)] = formula(`=SOMA($B$2:B${r + 1})`);
  }
  return {
    name: `acumulado-${rows}`,
    description: `${rows} totais acumulados SOMA($B$2:Bn)`,
    sheets: [sheet],
    targetId: 'acum',
    edit: { sheetId: 'acum', row: Math.floor(rows / 2), col: 1, raw: '12345' },
  };
}

/** Clona o necessário para repetir um cenário sem contaminar a medição seguinte. */
export function cloneSheets(sheets: Sheet[]): Sheet[] {
  return sheets.map(sheet => {
    const data: Record<string, CellData> = {};
    for (const k of Object.keys(sheet.data)) data[k] = { ...sheet.data[k] };
    return { ...sheet, data };
  });
}
