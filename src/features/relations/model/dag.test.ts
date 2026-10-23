// src/features/relations/model/dag.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edge, graphOf, table } from '../testing/fixtures';
import { downstreamOf, inputsOf, topologicalOrder } from './dag';
import { FlowNode } from './graph';

const out = (id: string): FlowNode => ({ id, kind: 'output', sheetName: id, x: 0, y: 0 });

describe('topologicalOrder', () => {
  it('ordena origem antes do destino', () => {
    const g = graphOf([out('o'), table('b', 's2'), table('a', 's1')], [edge('e1', 'a', 'o'), edge('e2', 'b', 'o', 'lookup')]);
    const result = topologicalOrder(g);
    assert.ok(result.ok);
    assert.ok(result.order.indexOf('a') < result.order.indexOf('o'));
    assert.ok(result.order.indexOf('b') < result.order.indexOf('o'));
    assert.equal(result.order.length, 3);
  });

  it('detecta ciclo e informa os nós envolvidos', () => {
    const g = graphOf([out('x'), out('y'), table('t', 's')], [edge('e1', 'x', 'y'), edge('e2', 'y', 'x')]);
    const result = topologicalOrder(g);
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual([...result.cycle].sort(), ['x', 'y']);
  });

  it('aceita grafo vazio', () => {
    const result = topologicalOrder(graphOf([], []));
    assert.deepEqual(result, { ok: true, order: [] });
  });
});

describe('downstreamOf', () => {
  const g = graphOf(
    [table('a', 's1'), table('b', 's2'), out('m'), out('o')],
    [edge('e1', 'a', 'm'), edge('e2', 'm', 'o'), edge('e3', 'b', 'o', 'lookup')]
  );

  it('inclui o próprio nó e tudo que depende dele', () => {
    assert.deepEqual([...downstreamOf(g, ['a'])].sort(), ['a', 'm', 'o']);
    assert.deepEqual([...downstreamOf(g, ['b'])].sort(), ['b', 'o']);
  });

  it('não inclui nós que não dependem da mudança', () => {
    assert.equal(downstreamOf(g, ['b']).has('m'), false);
  });
});

describe('inputsOf', () => {
  it('indexa as entradas pela porta', () => {
    const g = graphOf([table('a', 's1'), table('b', 's2'), out('o')], [edge('e1', 'a', 'o'), edge('e2', 'b', 'o', 'lookup')]);
    const inputs = inputsOf(g, 'o');
    assert.equal(inputs.in?.from, 'a');
    assert.equal(inputs.lookup?.from, 'b');
  });
});
