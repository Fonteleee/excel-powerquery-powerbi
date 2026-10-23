// src/engine/formulaParser.regression.test.ts
// Testes de regressão do comportamento ATUAL das fórmulas mais usadas. Servem de rede de segurança
// para a refatoração do motor (grafo de dependências, módulos por categoria). Fonte: validateAll.ts
// e test_cross_sheet.ts, mais os casos de borda observados no motor de varredura.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cellPosToKey,
  colIndexToLabel,
  evaluateFormula,
  formatCellValue,
  getCellValue,
  keyToCellPos,
  labelToColIndex,
  parseCellAddress,
  parseNumberSafely,
  parseRangeAddress,
  rangeToAddress,
  recalculateSheet,
  shiftFormula,
  valuesMatch,
} from './formulaParser';
import { buildSheet, cellAt, valueAt } from './testing/sheets';

const produtos = () =>
  buildSheet('p', 'Planilha Teste', [
    ['ID', 'Produto', 'Qtd', 'Preco', 'Peso'],
    ['P1', 'Notebook', 2, 5000, 1],
    ['P2', 'Mouse', 5, 100, 2],
    ['P3', 'Teclado', 3, 300, 1],
  ]);

describe('endereçamento', () => {
  it('converte colunas em rótulos e de volta', () => {
    assert.equal(colIndexToLabel(0), 'A');
    assert.equal(colIndexToLabel(25), 'Z');
    assert.equal(colIndexToLabel(26), 'AA');
    assert.equal(colIndexToLabel(701), 'ZZ');
    assert.equal(labelToColIndex('AA'), 26);
    assert.equal(labelToColIndex('b'), 1);
  });

  it('interpreta células, intervalos e colunas inteiras', () => {
    assert.deepEqual(parseCellAddress('$B$3'), { row: 2, col: 1 });
    assert.equal(parseCellAddress('3B'), null);
    assert.deepEqual(parseRangeAddress('A1:B3'), { startRow: 0, startCol: 0, endRow: 2, endCol: 1 });
    assert.deepEqual(parseRangeAddress('B:C', 50), { startRow: 0, startCol: 1, endRow: 49, endCol: 2 });
    assert.deepEqual(parseRangeAddress('$A:$A', 10), { startRow: 0, startCol: 0, endRow: 9, endCol: 0 });
    assert.equal(rangeToAddress({ startRow: 0, startCol: 0, endRow: 2, endCol: 1 }), 'A1:B3');
    assert.equal(cellPosToKey(4, 2), 'R4C2');
    assert.deepEqual(keyToCellPos('R4C2'), { row: 4, col: 2 });
  });

  it('desloca referências relativas e preserva as âncoras $', () => {
    assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 1, 1), '=B2+$B$2+D$3+$D5');
    assert.equal(shiftFormula('=Dados!A1*2', 2, 0), '=Dados!A3*2');
    assert.equal(shiftFormula('texto', 1, 1), 'texto');
  });
});

describe('números e comparação', () => {
  it('reconhece números em formato BR e US', () => {
    assert.equal(parseNumberSafely('1.234,56'), 1234.56);
    assert.equal(parseNumberSafely('1,234.56'), 1234.56);
    assert.equal(parseNumberSafely('R$ 10,50'), 10.5);
    assert.equal(parseNumberSafely('50%'), 0.5);
    assert.equal(parseNumberSafely('abc'), null);
    assert.equal(parseNumberSafely('10/01/2023'), null);
    assert.equal(parseNumberSafely('01:30', true), 5400);
  });

  it('valuesMatch: texto sem caixa, número como texto e curingas', () => {
    assert.equal(valuesMatch('ABC ', 'abc'), true);
    assert.equal(valuesMatch('100,00', 100), true);
    assert.equal(valuesMatch('Notebook Dell', 'Note*'), true);
    assert.equal(valuesMatch('Mouse', 'M?use'), true);
    assert.equal(valuesMatch(null, 'x'), false);
    assert.equal(valuesMatch('a', 'b'), false);
  });
});

describe('fórmulas básicas (avaliação direta)', () => {
  const s = produtos();
  const ev = (f: string) => evaluateFormula(f, s, [s]);

  it('SOMA, MÉDIA, MÁXIMO, MÍNIMO e CONT.VALORES', () => {
    assert.equal(ev('=SOMA(C2:C4)'), 10);
    assert.equal(ev('=soma(C2:C4)'), 10);
    assert.equal(ev('=SOMA(C2:C4; D2)'), 5010);
    assert.equal(ev('=MÉDIA(D2:D4)'), (5000 + 100 + 300) / 3);
    assert.equal(ev('=MÁXIMO(D2:D4)'), 5000);
    assert.equal(ev('=MÍNIMO(D2:D4)'), 100);
    assert.equal(ev('=CONT.VALORES(A1:A4)'), 4);
  });

  it('PROCX (com e sem valor padrão), PROCV, ÍNDICE e CORRESP', () => {
    assert.equal(ev('=PROCX("P2", A2:A4, B2:B4, "Não Encontrado")'), 'Mouse');
    assert.equal(ev('=procx("p2", A2:A4, B2:B4)'), 'Mouse');
    assert.equal(ev('=PROCX("P99", A2:A4, B2:B4, "Não Encontrado")'), 'Não Encontrado');
    assert.equal(ev('=PROCX("P99", A2:A4, B2:B4)'), '#N/D');
    assert.equal(ev('=PROCV("P3", A2:D4, 4, FALSO)'), 300);
    assert.equal(ev('=PROCV("P99", A2:D4, 4, FALSO)'), '#N/D');
    assert.equal(ev('=PROCV("P3", A2:D4, 9, FALSO)'), '#REF!');
    assert.equal(ev('=ÍNDICE(B2:D4, CORRESP("Teclado", B2:B4, 0), 2)'), 3);
    assert.equal(ev('=INDICE(B2:D4, 9, 1)'), '#REF!');
    assert.equal(ev('=CORRESP("Mouse", B2:B4, 0)'), 2);
  });

  it('SOMARPRODUTO, MÉDIA.PONDERADA, UNIRTEXTO e CONCATENAR', () => {
    assert.equal(ev('=SOMARPRODUTO(C2:C4, D2:D4)'), 11400);
    assert.equal(ev('=MÉDIA.PONDERADA(D2:D4, E2:E4)'), 1375);
    assert.equal(ev('=UNIRTEXTO(" - ", VERDADEIRO, B2:B4)'), 'Notebook - Mouse - Teclado');
    assert.equal(ev('=CONCATENAR(A2, "-", B2)'), 'P1-Notebook');
  });

  it('CONT.SE, SOMASE e MÉDIASE com operadores e curingas', () => {
    assert.equal(ev('=CONT.SE(C2:C4, ">2")'), 2);
    assert.equal(ev('=CONT.SE(C2:C4, "<=3")'), 2);
    assert.equal(ev('=CONT.SE(B2:B4, "Mouse")'), 1);
    assert.equal(ev('=CONT.SE(B2:B4, "<>Mouse")'), 2);
    assert.equal(ev('=CONT.SE(B2:B4, "T*")'), 1);
    assert.equal(ev('=SOMASE(B2:B4, "Mouse", C2:C4)'), 5);
    assert.equal(ev('=SOMASE(C2:C4, ">2")'), 8);
    assert.equal(ev('=SOMASE(C2:C4, ">2", D2:D4)'), 400);
    assert.equal(ev('=MÉDIASE(C2:C4, ">2", D2:D4)'), 200);
  });

  it('SE, SEERRO, ARRED, maiúsculas e minúsculas', () => {
    assert.equal(ev('=SE(C2>1; "sim"; "não")'), 'sim');
    assert.equal(ev('=SE(C2>10; "sim"; "não")'), 'não');
    assert.equal(ev('=SEERRO(10/0, 999)'), 999);
    assert.equal(ev('=SEERRO(PROCV("zz", A2:D4, 2, FALSO), "x")'), 'x');
    assert.equal(ev('=ARRED(10/3, 2)'), 3.33);
    assert.equal(ev('=MAIÚSCULA("abc")'), 'ABC');
    assert.equal(ev('=MINÚSCULA("ABC")'), 'abc');
    assert.equal(ev('=PRI.MAIÚSCULA("joão da silva")'), 'João Da Silva');
  });

  it('operadores: precedência, parênteses, & e comparações', () => {
    assert.equal(ev('=2+3*4'), 14);
    assert.equal(ev('=(2+3)*4'), 20);
    assert.equal(ev('=C2*D2*(1-0.1)'), 9000);
    assert.equal(ev('=10-4-3'), 3);
    assert.equal(ev('=A2&"-"&B2'), 'P1-Notebook');
    assert.equal(ev('=C2>1'), true);
    assert.equal(ev('=A2="P1"'), true);
    assert.equal(ev('=C2<>2'), false);
  });

  it('erros conhecidos', () => {
    assert.equal(ev('=1/0'), '#DIV/0!');
    assert.equal(ev('=FUNCAOINEXISTENTE(1)'), '#NOME?');
    assert.equal(ev('=MÉDIA(Z1:Z3)'), '#DIV/0!');
  });

  it('texto sem "=" devolve número quando possível', () => {
    assert.equal(evaluateFormula('12,5', s, [s]), 12.5);
    assert.equal(evaluateFormula('abc', s, [s]), 'abc');
  });
});

describe('fórmulas entre abas', () => {
  const acomp = buildSheet('acomp', 'Acompanhamento de Pagamentos', [
    ['ID', 'Item', 'Qtd', 'Valor'],
    ['P1', 'Notebook', 2, 4500],
    ['P2', 'Mouse', 5, 120],
    ['P3', 'Teclado', 3, 350],
  ]);
  const p2 = buildSheet('p2', 'Planilha 2', [['Busca ID'], ['P2']]);
  const all = [acomp, p2];
  const ev = (f: string) => evaluateFormula(f, p2, all);
  const aba = "'Acompanhamento de Pagamentos'";

  it('PROCX, ÍNDICE+CORRESP, PROCV, SOMA e SOMASE em outra aba', () => {
    assert.equal(ev(`=PROCX(A2, ${aba}!A2:A4, ${aba}!B2:B4, "Não Encontrado")`), 'Mouse');
    assert.equal(ev(`=ÍNDICE(${aba}!B2:D4, CORRESP("Teclado", ${aba}!B2:B4, 0), 2)`), 3);
    assert.equal(ev(`=PROCV("P3", ${aba}!A2:D4, 4, FALSO)`), 350);
    assert.equal(ev(`=SOMA(${aba}!C2:C4)`), 10);
    assert.equal(ev(`=SOMASE(${aba}!B2:B4, "Mouse", ${aba}!C2:C4)`), 5);
  });

  it('aceita nome abreviado com reticências e referência direta com aritmética', () => {
    assert.equal(ev(`=PROCX("P2", 'Acompanhamento de Pa...'!A2:A4, 'Acompanhamento de Pa...'!B2:B4, "x")`), 'Mouse');
    assert.equal(ev(`=${aba}!D2 * 2`), 9000);
  });

  it('colunas inteiras entre abas usam o tamanho da aba de destino', () => {
    assert.equal(ev(`=PROCX("P3", ${aba}!A:A, ${aba}!B:B)`), 'Teclado');
  });
});

describe('recalculateSheet', () => {
  it('calcula fórmulas dependentes em cadeia na mesma aba', () => {
    const sheet = buildSheet('s', 'S', [[1], ['=A1+1'], ['=A2+1'], ['=A3*2'], ['=SOMA(A1:A4)']]);
    const out = recalculateSheet(sheet);
    assert.equal(valueAt(out, 'A2'), 2);
    assert.equal(valueAt(out, 'A3'), 3);
    assert.equal(valueAt(out, 'A4'), 6);
    assert.equal(valueAt(out, 'A5'), 12);
  });

  it('converge mesmo com dependências declaradas "de baixo para cima"', () => {
    const sheet = buildSheet('s', 'S', [['=B1+1', '=C1+1', 10]]);
    const out = recalculateSheet(sheet);
    assert.equal(valueAt(out, 'A1'), 12);
    assert.equal(valueAt(out, 'B1'), 11);
  });

  it('recalcula fórmulas que leem outra aba', () => {
    const cad = buildSheet('cad', 'Cadastro', [['CAT-1', 'Alimentos', 0.1], ['CAT-2', 'Bebidas', 0.2]]);
    const dados = buildSheet('dados', 'Dados', [['CAT-2', '=PROCX(A1, Cadastro!A:A, Cadastro!B:B, "?")', '=PROCV(A1, Cadastro!A1:C2, 3, FALSO)']]);
    const out = recalculateSheet(dados, [dados, cad]);
    assert.equal(valueAt(out, 'B1'), 'Bebidas');
    assert.equal(valueAt(out, 'C1'), 0.2);
  });

  it('não altera a planilha de entrada (imutável)', () => {
    const sheet = buildSheet('s', 'S', [[1], ['=A1+1']]);
    const before = JSON.stringify(sheet.data);
    recalculateSheet(sheet);
    assert.equal(JSON.stringify(sheet.data), before);
  });

  it('marca erro na célula com resultado "#..."', () => {
    const out = recalculateSheet(buildSheet('s', 'S', [[1, 0, '=A1/B1']]));
    assert.equal(valueAt(out, 'C1'), '#DIV/0!');
    assert.equal(cellAt(out, 'C1')?.error, '#DIV/0!');
  });

  it('referência circular devolve #CIRCULAR! nas células do ciclo', () => {
    const out = recalculateSheet(buildSheet('s', 'S', [['=B1', '=A1']]));
    assert.equal(valueAt(out, 'A1'), '#CIRCULAR!');
    assert.equal(valueAt(out, 'B1'), '#CIRCULAR!');
  });

  it('getCellValue avalia fórmulas ainda não calculadas', () => {
    const sheet = buildSheet('s', 'S', [[2, '=A1*3']]);
    assert.equal(getCellValue(sheet, 0, 1), 6);
  });
});

describe('matrizes dinâmicas (spill) no motor atual', () => {
  it('SEQUÊNCIA derrama para baixo e para a direita', () => {
    const out = recalculateSheet(buildSheet('s', 'S', [['=SEQUÊNCIA(3;2)']]));
    assert.equal(valueAt(out, 'A1'), 1);
    assert.equal(valueAt(out, 'B1'), 2);
    assert.equal(valueAt(out, 'A2'), 3);
    assert.equal(valueAt(out, 'B3'), 6);
    assert.equal(cellAt(out, 'B3')?.isSpill, true);
    assert.equal(cellAt(out, 'B3')?.spillParent, 'R0C0');
    assert.deepEqual(cellAt(out, 'A1')?.spillRange, { startRow: 0, startCol: 0, endRow: 2, endCol: 1 });
  });

  it('ÚNICO, CLASSIFICAR e FILTRO produzem matrizes', () => {
    const base = [['b', 3], ['a', 1], ['b', 2], ['c', 5]];
    const unico = recalculateSheet(buildSheet('s', 'S', [...base.map(r => [...r]), ['=ÚNICO(A1:A4)']]));
    assert.equal(valueAt(unico, 'A5'), 'b');
    assert.equal(valueAt(unico, 'A6'), 'a');
    assert.equal(valueAt(unico, 'A7'), 'c');

    const classificar = recalculateSheet(buildSheet('s', 'S', [...base.map(r => [...r]), ['=CLASSIFICAR(A1:B4; 2; 1)']]));
    assert.equal(valueAt(classificar, 'A5'), 'a');
    assert.equal(valueAt(classificar, 'B5'), 1);
    assert.equal(valueAt(classificar, 'B8'), 5);

    const filtro = recalculateSheet(buildSheet('s', 'S', [...base.map(r => [...r]), ['=FILTRO(A1:B4; B1:B4>1)']]));
    assert.equal(valueAt(filtro, 'A5'), 'b');
    assert.equal(valueAt(filtro, 'A6'), 'b');
    assert.equal(valueAt(filtro, 'A7'), 'c');
  });

  it('bloqueio por célula ocupada gera #DESPEJAR!', () => {
    const out = recalculateSheet(buildSheet('s', 'S', [['=SEQUÊNCIA(3)'], [null], ['ocupado']]));
    assert.equal(valueAt(out, 'A1'), '#DESPEJAR!');
    assert.equal(cellAt(out, 'A2'), undefined);
    assert.equal(valueAt(out, 'A3'), 'ocupado');
  });

  it('as células derramadas são recriadas a cada recálculo (sem resíduo)', () => {
    const first = recalculateSheet(buildSheet('s', 'S', [['=SEQUÊNCIA(3)']]));
    const edited = { ...first, data: { ...first.data, R0C0: { raw: '=SEQUÊNCIA(2)', value: null } } };
    const second = recalculateSheet(edited);
    assert.equal(valueAt(second, 'A2'), 2);
    assert.equal(cellAt(second, 'A3'), undefined);
  });
});

describe('formatCellValue', () => {
  it('formata moeda, percentual, tempo e texto', () => {
    assert.match(formatCellValue(1234.5, { type: 'currency' }), /1\.234,50/);
    assert.equal(formatCellValue(0.25, { type: 'percentage', decimals: 0 }), '25%');
    assert.equal(formatCellValue('05:27:26', { type: 'time_hh_mm_ss' }), '05:27:26');
    assert.equal(formatCellValue(60, { type: 'time_from_minutes' }), '01:00:00');
    assert.equal(formatCellValue('abc', { textCase: 'uppercase' }), 'ABC');
    assert.equal(formatCellValue('#N/D'), '#N/D');
    assert.equal(formatCellValue(null), '');
  });
});
