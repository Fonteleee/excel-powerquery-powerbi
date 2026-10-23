// src/features/relations/analysis/suggestions.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggestOperations } from './suggestions';
import { ColumnTypeInfo, InferredType } from './typeInference';

const info = (type: InferredType): ColumnTypeInfo => ({
  type,
  filled: 10,
  distinct: 10,
  uniqueRatio: 1,
  emptyRate: 0,
});

const ops = (from: InferredType, to: InferredType, sameTable = false): string[] =>
  suggestOperations(info(from), info(to), { sameTable }).map(s => s.op);

describe('suggestOperations', () => {
  it('ID/texto contra ID/texto: buscar primeiro', () => {
    assert.equal(ops('id', 'id')[0], 'lookup');
    assert.equal(ops('text', 'text')[0], 'lookup');
    assert.equal(ops('id', 'text')[0], 'lookup');
  });

  it('destino numérico: agregar primeiro (somar, média, contar), buscar fica depois', () => {
    const list = ops('id', 'number');
    assert.deepEqual(list.slice(0, 3), ['sum', 'avg', 'count']);
    assert.ok(list.indexOf('lookup') > list.indexOf('count'));
  });

  it('numérico com numérico não sugere buscar', () => {
    const list = ops('number', 'number');
    assert.ok(list.indexOf('lookup') > 2);
  });

  it('data sugere mínimo/máximo logo após a busca', () => {
    const list = ops('id', 'date');
    assert.ok(list.indexOf('min') < list.indexOf('sum'));
    assert.ok(list.indexOf('max') < list.indexOf('avg'));
  });

  it('booleano: filtrar ou contar à frente', () => {
    assert.deepEqual(ops('id', 'boolean').slice(0, 2), ['filter', 'count']);
  });

  it('na mesma tabela a busca perde prioridade para agregar', () => {
    assert.equal(ops('id', 'text', true)[0], 'lookup');
    assert.equal(ops('id', 'number', true)[0], 'sum');
  });

  it('nunca esconde operações', () => {
    for (const from of ['id', 'text', 'number', 'date', 'boolean', 'empty'] as InferredType[]) {
      for (const to of ['id', 'text', 'number', 'date', 'boolean', 'empty'] as InferredType[]) {
        assert.equal(new Set(ops(from, to)).size, 7, `${from}->${to}`);
      }
    }
  });

  it('sem informação de tipo mantém a ordem padrão e explica a recomendação', () => {
    const list = suggestOperations(undefined, undefined);
    assert.equal(list[0].op, 'lookup');
    assert.equal(list[0].recommended, true);
    assert.ok(list[0].reason.length > 0);
    assert.equal(list.filter(s => s.recommended).length, 1);
  });

  it('ordem estável: pontuações iguais mantêm a ordem padrão', () => {
    const list = ops('empty', 'empty');
    assert.deepEqual(list, ['lookup', 'sum', 'avg', 'count', 'filter', 'min', 'max']);
  });
});
