import { evaluateFormula, recalculateSheet, cellPosToKey } from './src/engine/formulaParser';
import { Sheet } from './src/types/spreadsheet';

console.log('=== TESTANDO FÓRMULAS ENTRE ABAS (CROSS-SHEET REFERENCES) ===\n');

// 1. Criar Sheet "Acompanhamento de Pagamentos" (ou Acompanhamento de Pa...)
const sheetAcompanhamento: Sheet = {
  id: 'sheet-acomp',
  name: 'Acompanhamento de Pagamentos',
  rowCount: 50,
  colCount: 20,
  colWidths: {},
  rowHeights: {},
  mergedRegions: [],
  data: {
    // Linha 1 (Cabeçalhos)
    [cellPosToKey(0, 0)]: { raw: 'ID', value: 'ID' },
    [cellPosToKey(0, 1)]: { raw: 'Item', value: 'Item' },
    [cellPosToKey(0, 2)]: { raw: 'Qtd', value: 10 },
    [cellPosToKey(0, 3)]: { raw: 'Valor', value: 1500 },

    // Linha 2 (P1, Notebook, 2, R$ 4500)
    [cellPosToKey(1, 0)]: { raw: 'P1', value: 'P1' },
    [cellPosToKey(1, 1)]: { raw: 'Notebook', value: 'Notebook' },
    [cellPosToKey(1, 2)]: { raw: '2', value: 2 },
    [cellPosToKey(1, 3)]: { raw: '4500', value: 4500 },

    // Linha 3 (P2, Mouse, 5, R$ 120)
    [cellPosToKey(2, 0)]: { raw: 'P2', value: 'P2' },
    [cellPosToKey(2, 1)]: { raw: 'Mouse', value: 'Mouse' },
    [cellPosToKey(2, 2)]: { raw: '5', value: 5 },
    [cellPosToKey(2, 3)]: { raw: '120', value: 120 },

    // Linha 4 (P3, Teclado, 3, R$ 350)
    [cellPosToKey(3, 0)]: { raw: 'P3', value: 'P3' },
    [cellPosToKey(3, 1)]: { raw: 'Teclado', value: 'Teclado' },
    [cellPosToKey(3, 2)]: { raw: '3', value: 3 },
    [cellPosToKey(3, 3)]: { raw: '350', value: 350 },
  }
};

// 2. Criar Sheet "Planilha 2"
const sheetPlanilha2: Sheet = {
  id: 'sheet-p2',
  name: 'Planilha 2',
  rowCount: 50,
  colCount: 20,
  colWidths: {},
  rowHeights: {},
  mergedRegions: [],
  data: {
    [cellPosToKey(0, 0)]: { raw: 'Busca ID', value: 'Busca ID' },
    [cellPosToKey(1, 0)]: { raw: 'P2', value: 'P2' },
  }
};

const allSheets = [sheetAcompanhamento, sheetPlanilha2];

const tests = [
  {
    name: '1. PROCX buscando na aba Acompanhamento por ID ("P2" -> "Mouse")',
    formula: '=PROCX(A2, \'Acompanhamento de Pagamentos\'!A2:A4, \'Acompanhamento de Pagamentos\'!B2:B4, "Não Encontrado")',
    expected: 'Mouse',
  },
  {
    name: '2. PROCX com nome abreviado ("Acompanhamento de Pa..." -> "Mouse")',
    formula: '=PROCX("P2", \'Acompanhamento de Pa...\'!A2:A4, \'Acompanhamento de Pa...\'!B2:B4, "Não Encontrado")',
    expected: 'Mouse',
  },
  {
    name: '3. ÍNDICE + CORRESP buscando quantidade do Teclado na outra aba',
    formula: '=ÍNDICE(\'Acompanhamento de Pagamentos\'!B2:D4, CORRESP("Teclado", \'Acompanhamento de Pagamentos\'!B2:B4, 0), 2)',
    expected: 3,
  },
  {
    name: '4. PROCV buscando o valor do produto P3 na coluna 4',
    formula: '=PROCV("P3", \'Acompanhamento de Pagamentos\'!A2:D4, 4, FALSO)',
    expected: 350,
  },
  {
    name: '5. SOMA de quantidades da aba Acompanhamento de Pagamentos (2 + 5 + 3 = 10)',
    formula: '=SOMA(\'Acompanhamento de Pagamentos\'!C2:C4)',
    expected: 10,
  },
  {
    name: '6. SOMASE somando quantidade onde item é "Mouse" (= 5)',
    formula: '=SOMASE(\'Acompanhamento de Pagamentos\'!B2:B4, "Mouse", \'Acompanhamento de Pagamentos\'!C2:C4)',
    expected: 5,
  },
  {
    name: '7. Referência direta de célula cross-sheet com cálculo aritmético (\'Acompanhamento\'!D2 * 2)',
    formula: '=\'Acompanhamento de Pagamentos\'!D2 * 2',
    expected: 9000,
  },
];

let passed = 0;
for (const t of tests) {
  const result = evaluateFormula(t.formula, sheetPlanilha2, allSheets);
  const ok = result === t.expected;
  if (ok) {
    passed++;
    console.log(`✅ ${t.name}`);
    console.log(`   Fórmula: ${t.formula}`);
    console.log(`   Resultado: ${result} (Esperado: ${t.expected})\n`);
  } else {
    console.error(`❌ ${t.name}`);
    console.error(`   Fórmula: ${t.formula}`);
    console.error(`   Resultado: ${result} (Esperado: ${t.expected})\n`);
  }
}

console.log(`=========================================`);
console.log(`RESULTADO: ${passed}/${tests.length} PASSOU (${(passed / tests.length) * 100}% de sucesso)`);
console.log(`=========================================`);

if (passed !== tests.length) {
  process.exit(1);
}
