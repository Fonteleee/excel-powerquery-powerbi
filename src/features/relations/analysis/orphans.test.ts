// src/features/relations/analysis/orphans.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateGraph } from '../runtime/evaluate';
import { edge, graphOf, lookupFlow, makeSheet, outputNode, sampleSheets, table, transformNode } from '../testing/fixtures';
import { inspectLookup } from './orphans';

const pedidosSheets = () => [
  makeSheet(
    'pedidos',
    'Pedidos',
    ['Cod', 'Cliente'],
    [
      [1, 'Ana'], // bate com "1"
      ['001', 'Bia'], // órfão: bateria numericamente com 1
      [2.5, 'Caio'], // bate com "2.5"
      [99, 'Duda'], // órfão de verdade
      [null, 'Edu'], // chave nula
      ['', 'Fabi'], // chave vazia
      [99, 'Gil'], // outro órfão com a mesma chave
    ]
  ),
  makeSheet(
    'clientes',
    'Clientes',
    ['Código', 'Nome'],
    [
      ['1', 'Um'],
      ['1', 'Um-bis'], // duplicada
      ['2.5', 'Dois e meio'],
      [null, 'Sem chave'],
      ['7', 'Sete'],
      ['7', 'Sete-bis'],
      ['7', 'Sete-ter'],
    ]
  ),
];

const flow = () =>
  graphOf(
    [
      table('ta', 'pedidos'),
      table('tb', 'clientes'),
      transformNode('lk', { op: 'lookup', sourceKey: 'Cod', lookupKey: 'Código', returns: ['Nome'], ifNotFound: 'N/D' }),
      outputNode('out'),
    ],
    [edge('e1', 'ta', 'lk'), edge('e2', 'tb', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
  );

describe('inspectLookup', () => {
  it('conta órfãos, nulos, duplicatas e tipos, batendo com as estatísticas do motor', () => {
    const graph = flow();
    const results = evaluateGraph(graph, pedidosSheets());
    const r = inspectLookup(graph, 'lk', results);
    assert.ok(r.ok);
    const i = r.inspection;

    assert.equal(i.sourceRows, 7);
    assert.equal(i.nullKeyCount, 2);
    assert.equal(i.keyedRows, 5);
    assert.equal(i.matchedRows, 2);
    assert.equal(i.orphanCount, 3);
    assert.deepEqual(i.orphanSample.map(o => o.row['Cliente']), ['Bia', 'Duda', 'Gil']);
    assert.deepEqual(i.nullKeySample.map(o => o.row['Cliente']), ['Edu', 'Fabi']);

    const stats = results.get('lk')!.lookup!;
    assert.equal(i.orphanCount, stats.orphans);
    assert.equal(i.matchedRows, stats.matched);
    assert.equal(i.keyedRows, stats.sourceRows);
    assert.equal(i.duplicateLookup.extraRows, stats.duplicateLookupKeys);
  });

  it('acusa chaves duplicadas na tabela de busca e linhas sem chave', () => {
    const graph = flow();
    const r = inspectLookup(graph, 'lk', evaluateGraph(graph, pedidosSheets()));
    assert.ok(r.ok);
    const d = r.inspection.duplicateLookup;
    assert.equal(d.extraRows, 3);
    assert.equal(d.duplicatedKeys, 2);
    assert.equal(d.nullKeyRows, 1);
    assert.deepEqual(d.sample.map(s => [s.key, s.count, s.rowIndexes]), [
      ['1', 2, [0, 1]],
      ['7', 3, [4, 5, 6]],
    ]);
  });

  it('detecta tipos incompatíveis: órfão que bateria numericamente', () => {
    const graph = flow();
    const r = inspectLookup(graph, 'lk', evaluateGraph(graph, pedidosSheets()));
    assert.ok(r.ok);
    const t = r.inspection.typeMismatch;
    assert.equal(t.count, 1);
    assert.equal(t.sample[0].key, '001');
    assert.equal(t.sample[0].wouldMatch, '1');
    assert.equal(t.sourceKinds.number >= 3, true);
    assert.equal(t.lookupKinds.text, 6);
    assert.equal(t.lookupDominant, 'text');
  });

  it('número na origem e texto na busca marca kindsDiffer', () => {
    const sheets = [
      makeSheet('a', 'A', ['K'], [[1], [2], [3]]),
      makeSheet('b', 'B', ['K', 'V'], [['1', 'x'], ['2', 'y']]),
    ];
    const graph = graphOf(
      [
        table('ta', 'a'),
        table('tb', 'b'),
        transformNode('lk', { op: 'lookup', sourceKey: 'K', lookupKey: 'K', returns: ['V'], ifNotFound: '' }),
      ],
      [edge('e1', 'ta', 'lk'), edge('e2', 'tb', 'lk', 'lookup')]
    );
    const r = inspectLookup(graph, 'lk', evaluateGraph(graph, sheets));
    assert.ok(r.ok);
    assert.equal(r.inspection.typeMismatch.kindsDiffer, true);
    assert.equal(r.inspection.orphanCount, 1);
  });

  it('respeita o limite da amostra e mantém as contagens completas', () => {
    const graph = flow();
    const results = evaluateGraph(graph, pedidosSheets());
    const r = inspectLookup(graph, 'lk', results, { sampleLimit: 1 });
    assert.ok(r.ok);
    assert.equal(r.inspection.orphanSample.length, 1);
    assert.equal(r.inspection.orphanCount, 3);
    assert.equal(r.inspection.nullKeySample.length, 1);
    assert.equal(r.inspection.duplicateLookup.sample.length, 1);

    const zero = inspectLookup(graph, 'lk', results, { sampleLimit: 0 });
    assert.ok(zero.ok);
    assert.equal(zero.inspection.orphanSample.length, 0);
    assert.equal(zero.inspection.orphanCount, 3);

    const absurd = inspectLookup(graph, 'lk', results, { sampleLimit: Number.NaN });
    assert.ok(absurd.ok);
    assert.equal(absurd.inspection.orphanSample.length, 3);
  });

  it('fluxo padrão: só A03 e A04 ficam sem pausa', () => {
    const graph = lookupFlow({ returns: ['Minutos'] });
    const sheets = sampleSheets();
    const r = inspectLookup(graph, 'lk', evaluateGraph(graph, sheets));
    assert.ok(r.ok);
    assert.equal(r.inspection.orphanCount, 2); // A03 e A04 não têm pausa
    assert.equal(r.inspection.nullKeyCount, 0);
    assert.equal(r.inspection.typeMismatch.count, 0);
    assert.equal(r.inspection.typeMismatch.kindsDiffer, false);
    assert.equal(r.inspection.duplicateLookup.extraRows, 1);
  });

  it('não altera o resultado do motor nem a tabela de origem', () => {
    const graph = flow();
    const results = evaluateGraph(graph, pedidosSheets());
    const before = JSON.stringify([...results.entries()]);
    inspectLookup(graph, 'lk', results);
    assert.equal(JSON.stringify([...results.entries()]), before);
  });

  it('erros: nó inexistente, nó que não é lookup e entradas com erro', () => {
    const graph = flow();
    const results = evaluateGraph(graph, pedidosSheets());
    assert.ok(!inspectLookup(graph, 'nada', results).ok);
    assert.ok(!inspectLookup(graph, 'ta', results).ok);

    const broken = evaluateGraph(graph, [pedidosSheets()[0]]);
    const r = inspectLookup(graph, 'lk', broken);
    assert.ok(!r.ok);
    assert.match(r.error, /busca/);
  });
});
