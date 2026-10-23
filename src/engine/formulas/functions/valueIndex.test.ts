// src/engine/formulas/functions/valueIndex.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng } from '../../__bench__/syntheticSheets';
import { valuesMatch } from '../numbers';
import { createSession, withSession } from '../session';
import { ValueIndex, firstColumnOf, indexFor } from './valueIndex';

describe('ValueIndex', () => {
  const pool: unknown[] = [
    'Notebook', 'notebook ', ' MOUSE', 'Mouse', 'P1', 'p1', '100', 100, '100,00', '1.234,56', 1234.56, 0.1, '0,1',
    '10%', 0.1000000001, '', null, undefined, true, 'abc', 'ABC', 7, '7', '07', 'R$ 7,00',
  ];
  const criteria: unknown[] = [
    'notebook', 'MOUSE', 'p1', 100, '100', '100,00', 1234.56, '1.234,56', 0.1, '0,1', 0.1000000002, '', 'abc',
    7, '7,0', true, 'inexistente', null, undefined, 'R$ 7,00',
  ];

  it('dá exatamente o mesmo resultado de varrer com valuesMatch', () => {
    const rng = createRng(5);
    for (let round = 0; round < 40; round++) {
      const values = Array.from({ length: 30 }, () => pool[Math.floor(rng() * pool.length)]);
      const index = new ValueIndex(values);
      for (const c of criteria) {
        const expected = values.map((v, i) => (v !== null && v !== undefined && valuesMatch(v, c) ? i : -1)).filter(i => i >= 0);
        assert.deepEqual(index.matches(c), expected, `critério ${String(c)} em ${JSON.stringify(values)}`);
        assert.equal(index.first(c), expected.length > 0 ? expected[0] : -1);
      }
    }
  });

  it('curingas não são indexáveis (devolve null para o chamador varrer)', () => {
    const index = new ValueIndex(['abc', 'abd']);
    assert.equal(index.matches('ab*'), null);
    assert.equal(index.first('a?c'), null);
  });

  it('indexFor só existe dentro de uma sessão e para vetores com 16+ itens', () => {
    const values = Array.from({ length: 20 }, (_, i) => `v${i}`);
    assert.equal(indexFor(values), null);
    const session = createSession({ isFresh: () => true, isPending: () => false });
    withSession(session, () => {
      const a = indexFor(values);
      assert.ok(a);
      assert.equal(indexFor(values), a, 'o índice é reaproveitado');
      assert.equal(indexFor(['x']), null);
      const matrix = [['k', 1], ['j', 2]];
      assert.equal(firstColumnOf(matrix), firstColumnOf(matrix), 'a primeira coluna também fica em cache');
    });
  });
});
