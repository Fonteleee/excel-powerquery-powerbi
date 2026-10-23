// src/features/relations/analysis/cableStatus.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FlowGraph, FlowNode } from '../model/graph';
import { evaluateGraph } from '../runtime/evaluate';
import { edge, graphOf, makeSheet, sampleSheets, table } from '../testing/fixtures';
import { cardinalityNote, describeCable } from './cableStatus';

const lookup = (sourceKey = 'Id', returns = ['Minutos']): FlowNode => ({
  id: 'lk',
  kind: 'transform',
  x: 0,
  y: 0,
  params: { op: 'lookup', sourceKey, lookupKey: 'Agente ID', returns, ifNotFound: '-' },
});
const agg: FlowNode = {
  id: 'ag',
  kind: 'transform',
  x: 0,
  y: 0,
  params: { op: 'aggregate', groupBy: ['Agente ID'], aggregations: [{ column: 'Minutos', agg: 'SUM' }] },
};
const out: FlowNode = { id: 'out', kind: 'output', x: 0, y: 0, sheetName: 'S' };

const graph = (sourceKey?: string): FlowGraph =>
  graphOf(
    [table('ta', 'agentes'), table('tp', 'pausas'), agg, lookup(sourceKey, ['SUM_Minutos']), out],
    [
      edge('e0', 'tp', 'ag'),
      edge('e1', 'ta', 'lk'),
      edge('e2', 'ag', 'lk', 'lookup'),
      edge('e3', 'lk', 'out'),
    ]
  );

describe('describeCable', () => {
  it('classifica a cor pelo que o cabo carrega', () => {
    const g = graph();
    const results = evaluateGraph(g, sampleSheets());
    const kind = (id: string) => describeCable(g, g.edges.find(e => e.id === id)!, results).kind;
    assert.equal(kind('e0'), 'raw');
    assert.equal(kind('e1'), 'raw');
    assert.equal(kind('e2'), 'lookup', 'cabo da porta de busca é roxo');
    assert.equal(kind('e3'), 'lookup', 'saída de lookup é roxa');
  });

  it('saída de agregação é laranja', () => {
    const g = graphOf([table('tp', 'pausas'), agg, out], [edge('e0', 'tp', 'ag'), edge('e1', 'ag', 'out')]);
    const results = evaluateGraph(g, sampleSheets());
    assert.equal(describeCable(g, g.edges[1], results).kind, 'aggregate');
  });

  it('marca órfãos no cabo de entrada do lookup, com as estatísticas', () => {
    const g = graph();
    const results = evaluateGraph(g, sampleSheets());
    const entry = describeCable(g, g.edges.find(e => e.id === 'e1')!, results);
    assert.equal(entry.problem, 'orphans');
    assert.equal(entry.lookup!.orphans, 2);
    assert.equal(entry.rows, 4);
    const exit = describeCable(g, g.edges.find(e => e.id === 'e3')!, results);
    assert.equal(exit.problem, 'none');
  });

  it('marca erro com a causa original quando um nó falha', () => {
    const g = graph('Inexistente');
    const results = evaluateGraph(g, sampleSheets());
    const entry = describeCable(g, g.edges.find(e => e.id === 'e1')!, results);
    assert.equal(entry.problem, 'error');
    assert.match(entry.message ?? '', /Inexistente/);
    const exit = describeCable(g, g.edges.find(e => e.id === 'e3')!, results);
    assert.equal(exit.problem, 'error');
    assert.match(exit.message ?? '', /Inexistente/);
  });

  it('sem órfãos o cabo fica saudável', () => {
    const sheets = [
      makeSheet('agentes', 'Agentes', ['Id'], [['A01'], ['A02']]),
      makeSheet('pausas', 'Pausas', ['Agente ID', 'Minutos'], [['A01', 5], ['A02', 7]]),
    ];
    const g = graphOf(
      [table('ta', 'agentes'), table('tp', 'pausas'), lookup(), out],
      [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
    );
    const results = evaluateGraph(g, sheets);
    const entry = describeCable(g, g.edges[0], results);
    assert.equal(entry.problem, 'none');
    assert.equal(entry.lookup!.matchRate, 100);
  });
});
describe('cardinalityNote', () => {
  const base = { sourceRows: 4, matched: 4, orphans: 0, matchRate: 100, duplicateLookupKeys: 0 };
  it('avisa só quando a duplicidade distorce o resultado', () => {
    assert.equal(cardinalityNote({ ...base, cardinality: '1:1' }).warning, null);
    assert.equal(cardinalityNote({ ...base, cardinality: 'N:1' }).warning, null);
    assert.match(cardinalityNote({ ...base, cardinality: '1:N' }).warning ?? '', /primeira ocorrência/);
    assert.match(cardinalityNote({ ...base, cardinality: 'N:N' }).warning ?? '', /dois lados/);
  });
});
