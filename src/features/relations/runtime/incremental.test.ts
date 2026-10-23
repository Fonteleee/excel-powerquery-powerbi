// src/features/relations/runtime/incremental.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { moveNode } from '../model/editor';
import { FlowGraph } from '../model/graph';
import { edge, graphOf, sampleSheets, table } from '../testing/fixtures';
import { evaluateGraph } from './evaluate';
import { evaluateIncremental } from './incremental';

const graph = (value: string): FlowGraph =>
  graphOf(
    [
      table('ta', 'agentes'),
      table('tp', 'pausas'),
      {
        id: 'f',
        kind: 'transform',
        x: 0,
        y: 0,
        params: { op: 'filter', conditions: [{ column: 'Equipe', operator: '=', value }] },
      },
      { id: 'o', kind: 'output', x: 0, y: 0, sheetName: 'Saida' },
    ],
    [edge('e1', 'ta', 'f'), edge('e2', 'f', 'o')]
  );

describe('evaluateIncremental', () => {
  it('avalia tudo na primeira vez', () => {
    const sheets = sampleSheets();
    const snap = evaluateIncremental(null, graph('Norte'), sheets);
    assert.equal(snap.results.get('f')!.table!.rows.length, 2);
  });

  it('reaproveita o mesmo resultado quando só a posição muda', () => {
    const sheets = sampleSheets();
    const first = evaluateIncremental(null, graph('Norte'), sheets);
    const second = evaluateIncremental(first, moveNode(graph('Norte'), 'f', 500, 500), sheets);
    assert.equal(second.results, first.results);
  });

  it('recalcula só o ramo afetado e mantém os resultados limpos', () => {
    const sheets = sampleSheets();
    const first = evaluateIncremental(null, graph('Norte'), sheets);
    const second = evaluateIncremental(first, graph('Sul'), sheets);
    assert.equal(second.results.get('ta'), first.results.get('ta'), 'tabela intacta reaproveitada');
    assert.equal(second.results.get('tp'), first.results.get('tp'));
    assert.notEqual(second.results.get('f'), first.results.get('f'));
    assert.deepEqual(
      second.results.get('o')!.table!.rows.map(r => r.Nome),
      ['Bruno', 'Diego']
    );
  });

  it('coincide com a avaliação completa', () => {
    const sheets = sampleSheets();
    const first = evaluateIncremental(null, graph('Norte'), sheets);
    const inc = evaluateIncremental(first, graph('Sul'), sheets);
    const full = evaluateGraph(graph('Sul'), sheets);
    for (const [id, result] of full) assert.deepEqual(inc.results.get(id), result);
  });

  it('reavalia tudo quando as planilhas mudam', () => {
    const first = evaluateIncremental(null, graph('Norte'), sampleSheets());
    const second = evaluateIncremental(first, graph('Norte'), sampleSheets());
    assert.notEqual(second.results.get('ta'), first.results.get('ta'));
  });
});
