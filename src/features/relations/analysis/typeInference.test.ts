// src/features/relations/analysis/typeInference.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferColumnType, inferTableTypes, looksLikeDate, parseLooseNumber } from './typeInference';

describe('parseLooseNumber', () => {
  it('entende formatos brasileiro e internacional', () => {
    assert.equal(parseLooseNumber('1.234,56'), 1234.56);
    assert.equal(parseLooseNumber('1,234.56'), 1234.56);
    assert.equal(parseLooseNumber('R$ 10,50'), 10.5);
    assert.equal(parseLooseNumber('15%'), 15);
    assert.equal(parseLooseNumber('-7'), -7);
    assert.equal(parseLooseNumber('1.234.567'), 1234567);
    assert.equal(parseLooseNumber(42), 42);
  });

  it('recusa o que não é número', () => {
    assert.equal(parseLooseNumber('abc'), null);
    assert.equal(parseLooseNumber('007'), null, 'zeros à esquerda são código');
    assert.equal(parseLooseNumber('12/05/2024'), null);
    assert.equal(parseLooseNumber(''), null);
    assert.equal(parseLooseNumber(null), null);
    assert.equal(parseLooseNumber(Number.NaN), null);
    assert.equal(parseLooseNumber(true), null);
  });
});

describe('looksLikeDate', () => {
  it('aceita formatos comuns', () => {
    for (const v of ['2024-05-17', '17/05/2024', '1/2/24', '2024-05-17T10:30:00Z', '17-05-2024 08:00', '08:30', '23:59:59']) {
      assert.equal(looksLikeDate(v), true, v);
    }
  });

  it('recusa datas impossíveis e texto comum', () => {
    for (const v of ['32/01/2024', '2024-13-01', 'amanhã', '25:61', '1234', '']) {
      assert.equal(looksLikeDate(v), false, v);
    }
    assert.equal(looksLikeDate(20240517), false);
  });
});

describe('inferColumnType', () => {
  it('número, mesmo com decimais em texto e uma célula suja', () => {
    const values = ['10', '20,5', '30', '40', '50', '60', '70', '80', '90', 'n/d'];
    const info = inferColumnType(values, 'Valor');
    assert.equal(info.type, 'number');
    assert.deepEqual(info.numberRange, { min: 10, max: 90 });
    assert.equal(info.integerOnly, false);
  });

  it('data', () => {
    assert.equal(inferColumnType(['01/02/2024', '15/03/2024', '2024-04-10'], 'Quando').type, 'date');
  });

  it('booleano com poucas categorias', () => {
    assert.equal(inferColumnType(['Sim', 'Não', 'sim', 'NAO'], 'Ativo').type, 'boolean');
    assert.equal(inferColumnType([true, false, true]).type, 'boolean');
  });

  it('texto livre, sem confundir nome único com ID', () => {
    const info = inferColumnType(['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Alves'], 'Nome');
    assert.equal(info.type, 'text');
    assert.equal(info.uniqueRatio, 1);
  });

  it('chave por unicidade e formato de código', () => {
    assert.equal(inferColumnType(['A01', 'A02', 'A03', 'A04'], 'Coluna').type, 'id');
    assert.equal(inferColumnType(['CLI-0001', 'CLI-0002', 'CLI-0003']).type, 'id');
  });

  it('chave repetida (lado "muitos") é reconhecida pelo cabeçalho + formato de código', () => {
    assert.equal(inferColumnType(['a01', 'A02', 'A02', 'A09'], 'Agente ID').type, 'id');
    assert.equal(inferColumnType(['x1', 'x1', 'x1', 'x2'], 'AgenteID').type, 'id');
  });

  it('inteiros: ID só com dica de cabeçalho ou código longo de mesmo tamanho', () => {
    assert.equal(inferColumnType([1, 2, 3, 4], 'Id').type, 'id');
    assert.equal(inferColumnType([60, 10, 45, 30], 'Minutos').type, 'number');
    assert.equal(inferColumnType([10234, 10235, 10236, 10237], 'Pedido').type, 'id');
    assert.equal(inferColumnType([1.5, 2.5, 3.5], 'Id').type, 'number');
  });

  it('vazio quando não há valor preenchido', () => {
    const info = inferColumnType([null, '', undefined]);
    assert.equal(info.type, 'empty');
    assert.equal(info.filled, 0);
    assert.equal(info.emptyRate, 1);
  });

  it('mede unicidade e taxa de vazios', () => {
    const info = inferColumnType(['a', 'a', 'b', null]);
    assert.equal(info.filled, 3);
    assert.equal(info.distinct, 2);
    assert.ok(Math.abs(info.uniqueRatio - 2 / 3) < 1e-9);
    assert.equal(info.emptyRate, 0.25);
  });

  it('textos com zeros à esquerda e dígitos viram código, não número', () => {
    assert.equal(inferColumnType(['007', '008', '009', '010']).type, 'id');
  });
});

describe('inferTableTypes', () => {
  it('infere cada coluna e memoiza por tabela', () => {
    const table = {
      headers: ['Id', 'Nome', 'Minutos'],
      rows: [
        { Id: 'A01', Nome: 'Ana', Minutos: 60 },
        { Id: 'A02', Nome: 'Bruno', Minutos: 10 },
        { Id: 'A03', Nome: 'Carla', Minutos: 45 },
      ],
    };
    const types = inferTableTypes(table);
    assert.equal(types.Id.type, 'id');
    assert.equal(types.Nome.type, 'text');
    assert.equal(types.Minutos.type, 'number');
    assert.equal(inferTableTypes(table), types);
  });
});
