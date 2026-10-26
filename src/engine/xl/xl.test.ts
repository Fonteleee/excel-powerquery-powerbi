// src/engine/xl/xl.test.ts
// Bateria de fórmulas com os resultados que o Excel (pt-BR) dá. Cobre operadores, texto, datas, lógica,
// estatística, referências entre abas e o caso do PROCX dentro da própria coluna de retorno.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFormula } from '../formulas/evaluator';
import { cellPosToKey, recalculateSheet } from '../formulaParser';
import { makeSheet } from '../../features/relations/testing/fixtures';
import { parseExpression } from './parser';

const base = makeSheet('s', 'S', ['Nome', 'Valor', 'Cat', 'Data'], [
  ['Ana', 10, 'A', '05/01/2024'],
  ['Bruno', 20, 'B', '06/01/2024'],
  ['Carla', 30, 'A', '07/01/2024'],
  ['Diego', 40, 'B', '08/02/2024'],
  ['Elisa', 50, 'A', '09/03/2024'],
]);
const outra = makeSheet('o', 'Outra', ['Chave', 'Preco'], [['Ana', 1.5], ['Bruno', 2.5], ['Zed', 9]]);
const minha = makeSheet('m', 'Minha Aba', ['X'], [['oi']]);
const all = [base, outra, minha];

const ev = (formula: string): unknown => evaluateFormula(formula, base, all);

function check(table: [string, unknown][]): void {
  for (const [formula, expected] of table) {
    const got = ev(formula);
    if (typeof expected === 'number' && typeof got === 'number') {
      assert.ok(Math.abs(got - expected) < 1e-9, `${formula} => ${String(got)} (esperado ${expected})`);
    } else {
      assert.deepEqual(got, expected, `${formula} => ${JSON.stringify(got)} (esperado ${JSON.stringify(expected)})`);
    }
  }
}

describe('operadores e precedência', () => {
  it('segue a ordem do Excel', () => {
    check([
      ['=2+3*4', 14],
      ['=(2+3)*4', 20],
      ['=2^3^2', 64],
      ['=-2^2', 4],
      ['=2^-1', 0.5],
      ['=10%', 0.1],
      ['=50%*200', 100],
      ['=10/4', 2.5],
      ['=7-2-1', 4],
      ['="a"&1+1', 'a2'],
      ['=1+1&"a"', '2a'],
      ['=--B2', 10],
      ['=-B2', -10],
      ['=+B2', 10],
      ['=0,1+0,2', 0.3],
      ['=1,5*2', 3],
    ]);
  });

  it('comparações: texto sem diferenciar maiúsculas, número < texto', () => {
    check([
      ['=1<2', true],
      ['="a"="A"', true],
      ['=5>"a"', false],
      ['="b">"a"', true],
      ['=B2>=10', true],
      ['=B2<>10', false],
      ['=VERDADEIRO=1', false],
    ]);
  });

  it('células vazias valem 0 em conta e "" em texto', () => {
    check([
      ['=A9+1', 1],
      ['=A9&"x"', 'x'],
      ['=A9=0', true],
      ['=A9=""', true],
    ]);
  });

  it('erros se propagam e são tratados', () => {
    check([
      ['=1/0', '#DIV/0!'],
      ['=SEERRO(1/0;"x")', 'x'],
      ['=SE(1;"a";1/0)', 'a'],
      ['=FUNCAOINEXISTENTE(1)', '#NOME?'],
      ['=1+"abc"', '#VALOR!'],
      ['=SEND(PROCV("zz";A2:B6;2;0);"nd")', 'nd'],
      ['=SEERRO(PROCV("zz", A2:D4, 2, FALSO), "x")', 'x'],
    ]);
  });

  it('aceita ";" (pt-BR) e "," (inglês) e aspas duplicadas', () => {
    check([
      ['=SOMA(1;2;3)', 6],
      ['=SUM(1,2,3)', 6],
      ['=SE(1>0,"a","b")', 'a'],
      ['="a""b"', 'a"b'],
      ['=CONCATENAR("a;b";"c")', 'a;bc'],
    ]);
  });
});

describe('lógica e informação', () => {
  it('SE, SES, E, OU, NÃO, ESCOLHER', () => {
    check([
      ['=SE(B2>5;"sim";"nao")', 'sim'],
      ['=SES(B2>50;"a";B2>5;"b")', 'b'],
      ['=E(B2>5;B3>5)', true],
      ['=OU(B2>50;B3>50)', false],
      ['=NÃO(B2>5)', false],
      ['=XOR(VERDADEIRO;FALSO)', true],
      ['=ESCOLHER(2;"a";"b";"c")', 'b'],
      ['=SE(B2>5;"x")', 'x'],
      ['=SE(B2>50;"x")', false],
    ]);
  });

  it('funções É.*', () => {
    check([
      ['=É.NÚM(B2)', true],
      ['=ÉTEXTO(A2)', true],
      ['=É.ERRO(1/0)', true],
      ['=É.ERRO(B2)', false],
      ['=ÉNÃO.DISP(PROCV("zz";A2:B6;2;0))', true],
      ['=É.CÉL.VAZIA(E2)', true],
      ['=ÉPAR(4)', true],
    ]);
  });

  it('SE com matrizes em SOMA e SOMARPRODUTO', () => {
    check([
      ['=SOMA(SE(B2:B6>20;1;0))', 3],
      ['=SOMARPRODUTO((B2:B6>20)*B2:B6)', 120],
      ['=SOMARPRODUTO(B2:B6;B2:B6)', 5500],
    ]);
  });
});

describe('matemática e estatística', () => {
  it('arredondamento como o Excel', () => {
    check([
      ['=ARRED(2,5;0)', 3],
      ['=ARRED(-2,5;0)', -3],
      ['=ARRED(2,567;1)', 2.6],
      ['=ARRED(1234,5678;-2)', 1200],
      ['=ARREDONDAR.PARA.CIMA(2,1;0)', 3],
      ['=ARREDONDAR.PARA.BAIXO(2,9;0)', 2],
      ['=TRUNCAR(-2,9)', -2],
      ['=INT(-2,9)', -3],
      ['=MOD(-3;2)', 1],
      ['=MOD(10;3)', 1],
      ['=POTÊNCIA(2;3)', 8],
      ['=RAIZ(16)', 4],
      ['=ABS(-3)', 3],
      ['=RAIZ(-1)', '#NÚM!'],
      ['=MOD(1;0)', '#DIV/0!'],
    ]);
  });

  it('soma, média, contagem e critérios', () => {
    check([
      ['=SOMA(B2:B6)', 150],
      ['=MÉDIA(B2:B6)', 30],
      ['=MÁXIMO(B2:B6)', 50],
      ['=CONT.NÚM(B2:B6)', 5],
      ['=CONT.VALORES(A2:A6)', 5],
      ['=CONT.SE(C2:C6;"A")', 3],
      ['=SOMASE(C2:C6;"A";B2:B6)', 90],
      ['=SOMASES(B2:B6;C2:C6;"A";B2:B6;">10")', 80],
      ['=CONT.SES(C2:C6;"A";B2:B6;">10")', 2],
      ['=MÉDIASES(B2:B6;C2:C6;"A")', 30],
      ['=MÁXIMOSES(B2:B6;C2:C6;"A")', 50],
      ['=MÍNIMOSES(B2:B6;C2:C6;"B")', 20],
      ['=CONT.SES(A2:A6;"?ar*")', 1],
    ]);
  });

  it('mediana, moda, desvio, ranking, percentis', () => {
    check([
      ['=MED(B2:B6)', 30],
      ['=MODO(1;2;2;3)', 2],
      ['=DESVPAD(B2:B6)', Math.sqrt(250)],
      ['=DESVPAD.P(B2:B6)', Math.sqrt(200)],
      ['=VAR.P(B2:B6)', 200],
      ['=GRANDE(B2:B6;2)', 40],
      ['=MENOR(B2:B6;2)', 20],
      ['=PERCENTIL(B2:B6;0,5)', 30],
      ['=QUARTIL(B2:B6;1)', 20],
      ['=ORDEM(B2;B2:B6)', 5],
      ['=ORDEM(B2;B2:B6;1)', 1],
      ['=SUBTOTAL(9;B2:B6)', 150],
    ]);
  });
});

describe('texto', () => {
  it('extração, busca e troca', () => {
    check([
      ['=ESQUERDA("Ana";2)', 'An'],
      ['=DIREITA("Ana";2)', 'na'],
      ['=EXT.TEXTO("Carla";2;3)', 'arl'],
      ['=NÚM.CARACT("Carla")', 5],
      ['=ARRUMAR("  a   b ")', 'a b'],
      ['=MAIÚSCULA("ana")', 'ANA'],
      ['=PRI.MAIÚSCULA("ana maria")', 'Ana Maria'],
      ['=SUBSTITUIR("a-b-c";"-";"+")', 'a+b+c'],
      ['=SUBSTITUIR("a-b-c";"-";"+";2)', 'a-b+c'],
      ['=LOCALIZAR("n";"Ana")', 2],
      ['=LOCALIZAR("A?A";"Banana")', 2],
      ['=PROCURAR("N";"Ana")', '#VALOR!'],
      ['=REPT("ab";3)', 'ababab'],
      ['=TEXTOANTES("a-b";"-")', 'a'],
      ['=TEXTODEPOIS("a-b";"-")', 'b'],
      ['=EXATO("a";"A")', false],
      ['=CONCATENAR(A2;"-";B2)', 'Ana-10'],
      ['=A2&" tem "&B2', 'Ana tem 10'],
    ]);
  });

  it('TEXTO e VALOR com máscaras brasileiras', () => {
    check([
      ['=TEXTO(B2;"0,00")', '10,00'],
      ['=TEXTO(1234,5;"#.##0,00")', '1.234,50'],
      ['=TEXTO(0,256;"0%")', '26%'],
      ['=TEXTO(1234,5;"R$ #.##0,00")', 'R$ 1.234,50'],
      ['=TEXTO(D2;"dd/mm/yyyy")', '05/01/2024'],
      ['=TEXTO(D2;"dd/mm")', '05/01'],
      ['=TEXTO(D2;"mmm")', 'jan'],
      ['=TEXTO(D2;"dddd")', 'sexta-feira'],
      ['=VALOR("12,5")', 12.5],
      ['=VALOR("10%")', 0.1],
    ]);
  });
});

describe('datas', () => {
  it('partes, aritmética e funções de data', () => {
    check([
      ['=ANO(D2)', 2024],
      ['=MÊS(D4)', 1],
      ['=DIA(D2)', 5],
      ['=D3-D2', 1],
      ['=DATA(2024;1;5)', '05/01/2024'],
      ['=DATA(2024;13;1)', '01/01/2025'],
      ['=DIA.DA.SEMANA(D2)', 6],
      ['=DIA.DA.SEMANA(D2;2)', 5],
      ['=DATADIF(D2;D4;"d")', 2],
      ['=DATADIF(D2;D5;"m")', 1],
      ['=DIAS(D3;D2)', 1],
      ['=FIMMÊS(D2;0)', '31/01/2024'],
      ['=DATAM(D2;1)', '05/02/2024'],
      ['=DIATRABALHO(D2;3)', '10/01/2024'],
      ['=DIATRABALHOTOTAL(D2;D3)', 1],
      ['=HORA(0,5)', 12],
      ['=VALOR.DATA("05/01/2024")', 45296],
    ]);
  });
});

describe('referências e buscas', () => {
  it('entre abas, com aspas e funções de referência', () => {
    check([
      ['=Outra!B2*2', 3],
      ['=\'Minha Aba\'!A2', 'oi'],
      ['=PROCX(A2;Outra!A:A;Outra!B:B;"-")', 1.5],
      ['=PROCX("Zzz";Outra!A:A;Outra!B:B;"-")', '-'],
      ['=PROCV("Bruno";A2:B6;2;FALSO)', 20],
      ['=ÍNDICE(B2:B6;CORRESP("Carla";A2:A6;0))', 30],
      ['=PROCH("Valor";A1:D6;2;FALSO)', 10],
      ['=INDIRETO("B2")', 10],
      ['=DESLOC(B2;1;0)', 20],
      ['=LIN(B3)', 3],
      ['=COL(C1)', 3],
      ['=LINS(B2:B6)', 5],
      ['=COLS(A1:D1)', 4],
    ]);
  });
});

describe('parser', () => {
  it('guarda o resultado e recusa fórmulas inválidas', () => {
    assert.equal(parseExpression('1+2'), parseExpression('1+2'));
    assert.throws(() => parseExpression('1+'));
    assert.throws(() => parseExpression('SOMA(1;2'));
    assert.throws(() => parseExpression('"aberta'));
  });
});

describe('PROCX dentro da própria coluna de retorno', () => {
  it('B16 = PROCX(D18; A:A; B:B) não é circular', () => {
    const rows: (string | number | null)[][] = [];
    for (let i = 1; i <= 11; i++) rows.push([`FILA_${i}`, i * 10]);
    const sheet = makeSheet('f', 'F', ['Nome', 'Recebidas'], rows);
    sheet.data[cellPosToKey(15, 1)] = { raw: '=PROCX( D18; A:A; B:B)', value: '' };
    sheet.data[cellPosToKey(17, 3)] = { raw: 'FILA_4', value: 'FILA_4' };
    sheet.rowCount = 30;
    sheet.colCount = 6;
    const done = recalculateSheet(sheet, [sheet]);
    assert.equal(done.data[cellPosToKey(15, 1)].value, 40);
    assert.ok(!done.data[cellPosToKey(15, 1)].error);
  });

  it('SOMA que inclui a própria célula continua sendo referência circular, como no Excel', () => {
    const sheet = makeSheet('g', 'G', ['V'], [[1], [2], [3]]);
    sheet.data[cellPosToKey(5, 0)] = { raw: '=SOMA(A:A)', value: '' };
    sheet.rowCount = 20;
    const done = recalculateSheet(sheet, [sheet]);
    assert.equal(done.data[cellPosToKey(5, 0)].value, '#CIRCULAR!');
  });
});
