// src/features/formulaWizard/recipes.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey, evaluateFormula } from '../../engine/formulaParser';
import { Sheet } from '../../types/spreadsheet';
import { ArgValues, buildFormula, criterion, explain, friendlyError, initialValues, listColumnOptions, literal, parseTypedNumber, RECIPES, searchRecipes } from './recipes';

function sheet(id: string, name: string, rows: (string | number)[][]): Sheet {
  const data: Sheet['data'] = {};
  rows.forEach((row, r) => row.forEach((v, c) => { data[cellPosToKey(r, c)] = { raw: String(v), value: v }; }));
  return { id, name, data, rowCount: 50, colCount: 10, colWidths: {}, rowHeights: {}, mergedRegions: [], conditionalRules: [] };
}

const vendas = sheet('v', 'Vendas', [
  ['Regiao', 'Produto', 'Qtd', 'Preco', 'Nome'],
  ['Sul', 'A', 2, 10.456, 'joão silva'],
  ['Norte', 'B', 5, 20, 'maria  souza'],
  ['Sul', 'B', 3, 20, 'ana'],
]);
const produtos = sheet('p', 'Tabela de Produtos', [['Codigo', 'Categoria'], ['A', 'Hardware'], ['B', 'Software']]);
const all = [vendas, produtos];
const columns = listColumnOptions(all, 'v');
const id = (sheetId: string, header: string) => columns.find(c => c.sheetId === sheetId && c.header === header)!.id;
const ctx = (row = 1) => ({ column: (cid: string | undefined) => columns.find(c => c.id === cid), row });
const recipe = (rid: string) => RECIPES.find(r => r.id === rid)!;
const run = (rid: string, values: ArgValues, row = 1) => {
  const formula = buildFormula(recipe(rid), values, ctx(row));
  assert.notEqual(formula, '', `fórmula vazia para ${rid}`);
  return { formula, value: evaluateFormula(formula, vendas, all) };
};

describe('assistente de fórmulas: cada objetivo gera uma fórmula que calcula', () => {
  it('contas de coluna inteira', () => {
    assert.equal(run('somar', { coluna: id('v', 'Qtd') }).value, 10);
    assert.equal(run('somar', { coluna: id('v', 'Qtd') }).formula, '=SOMA($C$2:$C$4)');
    assert.equal(Number(run('media', { coluna: id('v', 'Qtd') }).value).toFixed(2), '3.33');
    assert.equal(run('contar', { coluna: id('v', 'Regiao') }).value, 3);
    assert.equal(run('maior_menor', { qual: 'maior', coluna: id('v', 'Qtd') }).value, 5);
    assert.equal(run('maior_menor', { qual: 'menor', coluna: id('v', 'Qtd') }).value, 2);
  });

  it('contas linha a linha', () => {
    assert.equal(run('conta_colunas', { a: id('v', 'Qtd'), op: 'multiplicar', b: id('v', 'Preco') }, 2).value, 100);
    assert.equal(run('conta_colunas', { a: id('v', 'Qtd'), op: 'subtrair', b: id('v', 'Preco') }, 2).value, -15);
    assert.equal(run('percentual', { coluna: id('v', 'Qtd') }, 2).value, 0.5);
    assert.equal(run('arredondar', { coluna: id('v', 'Preco'), casas: '2' }, 1).value, 10.46);
  });

  it('condições', () => {
    assert.equal(run('somar_se', { filtro: id('v', 'Regiao'), op: '=', valor: 'Sul', soma: id('v', 'Qtd') }).value, 5);
    assert.equal(run('somar_se', { filtro: id('v', 'Qtd'), op: '>', valor: '2', soma: id('v', 'Qtd') }).value, 8);
    assert.equal(run('contar_se', { filtro: id('v', 'Regiao'), op: '=', valor: 'Sul' }).value, 2);
    assert.equal(run('contar_se', { filtro: id('v', 'Produto'), op: '<>', valor: 'A' }).value, 2);
    assert.equal(run('se', { coluna: id('v', 'Qtd'), op: '>=', valor: '3', sim: 'Alto', nao: 'Baixo' }, 1).value, 'Baixo');
    assert.equal(run('se', { coluna: id('v', 'Qtd'), op: '>=', valor: '3', sim: 'Alto', nao: 'Baixo' }, 2).value, 'Alto');
    assert.equal(run('se', { coluna: id('v', 'Regiao'), op: '=', valor: 'Sul', sim: 'S', nao: 'N' }, 1).value, 'S');
    assert.equal(run('se', { coluna: id('v', 'Nome'), op: 'contém', valor: 'silva', sim: 'tem', nao: 'não tem' }, 1).value, 'tem');
    assert.equal(run('se', { coluna: id('v', 'Nome'), op: 'contém', valor: 'silva', sim: 'tem', nao: 'não tem' }, 3).value, 'não tem');
  });

  it('busca em outra tabela (nome de aba com espaço)', () => {
    const values = { chave: id('v', 'Produto'), onde: id('p', 'Codigo'), trazer: id('p', 'Categoria'), vazio: 'Não encontrado' };
    assert.equal(run('buscar', values, 1).value, 'Hardware');
    assert.equal(run('buscar', values, 2).value, 'Software');
    assert.match(run('buscar', values, 1).formula, /'Tabela de Produtos'!\$A\$2:\$A\$3/);
  });

  it('textos', () => {
    assert.equal(run('juntar', { a: id('v', 'Regiao'), sep: 'traco', b: id('v', 'Produto') }, 1).value, 'Sul - A');
    assert.equal(run('texto', { coluna: id('v', 'Nome'), como: 'primeira' }, 1).value, 'João Silva');
    assert.equal(run('texto', { coluna: id('v', 'Nome'), como: 'maiuscula' }, 3).value, 'ANA');
    assert.equal(run('texto', { coluna: id('v', 'Nome'), como: 'arrumar' }, 2).value, 'maria souza');
  });

  it('todas as receitas têm fórmula e explicação com respostas iniciais completas', () => {
    for (const r of RECIPES) {
      const values = initialValues(r, columns, []);
      for (const arg of r.args) if (!values[arg.key]) values[arg.key] = arg.kind === 'coluna' || arg.kind === 'celula' ? columns[0].id : 'x';
      assert.notEqual(buildFormula(r, values, ctx()), '', r.id);
      assert.ok(explain(r, values, ctx()).length > 10, r.id);
    }
  });
});

describe('assistente de fórmulas: apoio', () => {
  it('falta de resposta obrigatória não gera fórmula', () => {
    assert.equal(buildFormula(recipe('somar'), { coluna: '' }, ctx()), '');
    assert.equal(buildFormula(recipe('se'), { coluna: id('v', 'Qtd'), op: '>', valor: '', sim: 'a', nao: 'b' }, ctx()), '');
  });

  it('números digitados no padrão brasileiro e textos com aspas', () => {
    assert.equal(parseTypedNumber('1.234,5'), 1234.5);
    assert.equal(parseTypedNumber('7'), 7);
    assert.equal(parseTypedNumber('Sul'), null);
    assert.equal(literal('1,5'), '1.5');
    assert.equal(literal('diz "oi"'), '"diz ""oi"""');
    assert.equal(criterion('>=', '10'), '">=10"');
    assert.equal(criterion('contém', 'abc'), '"*abc*"');
  });

  it('sugere colunas pela seleção e pelo tipo', () => {
    assert.equal(initialValues(recipe('somar'), columns, []).coluna, id('v', 'Qtd'));
    assert.equal(initialValues(recipe('somar'), columns, [3]).coluna, id('v', 'Preco'));
    const conta = initialValues(recipe('conta_colunas'), columns, []);
    assert.deepEqual([conta.a, conta.b], [id('v', 'Qtd'), id('v', 'Preco')]);
    const buscar = initialValues(recipe('buscar'), columns, []);
    assert.equal(buscar.onde, '');
  });

  it('busca por palavras comuns, sem acento', () => {
    assert.equal(searchRecipes('procv')[0].id, 'buscar');
    assert.equal(searchRecipes('media')[0].id, 'media');
    assert.ok(searchRecipes('nome sobrenome').some(r => r.id === 'juntar'));
    assert.equal(searchRecipes('').length, RECIPES.length);
  });

  it('erros viram mensagens simples', () => {
    assert.match(friendlyError('#DIV/0!') ?? '', /zero/);
    assert.equal(friendlyError('ok'), null);
  });
});
