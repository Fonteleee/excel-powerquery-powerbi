// src/features/relations/ui/ghostCache.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graphOf, makeSheet, table } from '../testing/fixtures';
import { createGhostCache, ghostTitle, groupGhostsByNode } from './ghostCache';

const sheets = () => [
  makeSheet('a', 'Agentes', ['Id'], [['1'], ['2'], ['3'], ['4']]),
  makeSheet('b', 'Pausas', ['AgenteId', 'Min'], [['1', 5], ['2', 6], ['3', 7], ['9', 8]]),
];

describe('createGhostCache', () => {
  it('calcula uma vez por coluna e reaproveita enquanto as planilhas são as mesmas', () => {
    let calls = 0;
    const cache = createGhostCache((s, id, col) => {
      calls++;
      return { suggestions: [], scannedCells: s.length, truncated: id === col };
    });
    const s = sheets();
    cache.get(s, 'a', 'Id');
    cache.get(s, 'a', 'Id');
    assert.equal(calls, 1);
    cache.get(s, 'b', 'Min');
    assert.equal(calls, 2);
    cache.get(sheets(), 'a', 'Id'); // novo array = dados podem ter mudado
    assert.equal(calls, 3);
  });

  it('respeita o limite de entradas', () => {
    const cache = createGhostCache(() => ({ suggestions: [], scannedCells: 0, truncated: false }), 2);
    const s = sheets();
    cache.get(s, 'a', 'c1');
    cache.get(s, 'a', 'c2');
    cache.get(s, 'a', 'c3');
    assert.equal(cache.size(), 2);
  });

  it('com o cálculo real, sugere AgenteId para Id e agrupa por cartão', () => {
    const s = sheets();
    const result = createGhostCache().get(s, 'a', 'Id');
    assert.equal(result.suggestions[0]?.column, 'AgenteId');
    const g = graphOf([table('t1', 'a'), table('t2', 'b')], []);
    const grouped = groupGhostsByNode(g, result.suggestions);
    assert.ok(grouped.get('t2')?.has('AgenteId'));
    assert.equal(grouped.has('t1'), false);
    assert.match(ghostTitle(result.suggestions[0]), /Possível ligação \(\d+%\)/);
  });
});
