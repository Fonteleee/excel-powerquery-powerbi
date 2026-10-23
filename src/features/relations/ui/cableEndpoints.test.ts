// src/features/relations/ui/cableEndpoints.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FlowGraph, FlowNode } from '../model/graph';
import { edge, graphOf, table } from '../testing/fixtures';
import { resolveEdgeEndpoints, sourceColumnHint } from './cableEndpoints';

const lookup: FlowNode = {
  id: 'lk',
  kind: 'transform',
  x: 600,
  y: 100,
  params: { op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['Motivo'], ifNotFound: '' },
};
const out: FlowNode = { id: 'out', kind: 'output', x: 900, y: 100, sheetName: 'S' };

const graph = (): FlowGraph =>
  graphOf(
    [table('ta', 'agentes', 0, 0), table('tp', 'pausas', 0, 400), lookup, out],
    [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
  );

describe('sourceColumnHint', () => {
  it('a porta de entrada sai do campo-chave de origem e a de busca, da coluna de busca', () => {
    const g = graph();
    assert.equal(sourceColumnHint(g, g.edges[0]), 'Id');
    assert.equal(sourceColumnHint(g, g.edges[1]), 'Agente ID');
  });

  it('cabos que não saem de tabela para transformação não têm campo', () => {
    const g = graph();
    assert.equal(sourceColumnHint(g, g.edges[2]), null);
  });

  it('agregação usa o primeiro agrupamento ou a primeira métrica; filtro usa a primeira condição', () => {
    const agg: FlowNode = { id: 'ag', kind: 'transform', x: 0, y: 0, params: { op: 'aggregate', groupBy: [], aggregations: [{ column: 'Minutos', agg: 'SUM' }] } };
    const flt: FlowNode = { id: 'ft', kind: 'transform', x: 0, y: 0, params: { op: 'filter', conditions: [{ column: 'Equipe', operator: '=', value: 'x' }] } };
    const g = graphOf([table('t', 's'), agg, flt], [edge('a', 't', 'ag'), edge('b', 't', 'ft')]);
    assert.equal(sourceColumnHint(g, g.edges[0]), 'Minutos');
    assert.equal(sourceColumnHint(g, g.edges[1]), 'Equipe');
  });

  it('parâmetro ainda vazio cai no pino da tabela', () => {
    const empty: FlowNode = { id: 'lk', kind: 'transform', x: 0, y: 0, params: { op: 'lookup', sourceKey: '', lookupKey: '', returns: [], ifNotFound: '' } };
    const g = graphOf([table('t', 's'), empty], [edge('a', 't', 'lk')]);
    assert.equal(sourceColumnHint(g, g.edges[0]), null);
  });
});

describe('resolveEdgeEndpoints', () => {
  it('usa os pinos MEDIDOS do campo e do nó de destino', () => {
    const g = graph();
    const anchors = {
      ta: { 'out:Id': { x: 288, y: 71 }, 'out:*': { x: 288, y: 20 } },
      lk: { 'in:in': { x: 20, y: 36 }, 'in:lookup': { x: 20, y: 84 } },
    };
    const r = resolveEdgeEndpoints(g, g.edges[0], anchors)!;
    assert.deepEqual(r.from, { x: 288, y: 71 });
    assert.deepEqual(r.to, { x: 620, y: 136 });
  });

  it('campo sem pino (cartão recolhido) cai no pino da tabela inteira', () => {
    const g = graph();
    const r = resolveEdgeEndpoints(g, g.edges[0], { ta: { 'out:*': { x: 288, y: 20 } } })!;
    assert.deepEqual(r.from, { x: 288, y: 20 });
  });

  it('antes da primeira medição usa posições de reserva dentro do nó', () => {
    const g = graph();
    const r = resolveEdgeEndpoints(g, g.edges[0], {})!;
    assert.ok(r.from.x > 0 && r.from.y > 0);
    assert.ok(r.to.x >= lookup.x && r.to.y >= lookup.y);
  });

  it('mover o nó move as extremidades sem nova medição', () => {
    const g = graph();
    const anchors = { ta: { 'out:Id': { x: 288, y: 71 } } };
    const before = resolveEdgeEndpoints(g, g.edges[0], anchors)!;
    const moved = { ...g, nodes: g.nodes.map(n => (n.id === 'ta' ? { ...n, x: 50, y: 30 } : n)) };
    const after = resolveEdgeEndpoints(moved, moved.edges[0], anchors)!;
    assert.deepEqual([after.from.x - before.from.x, after.from.y - before.from.y], [50, 30]);
  });

  it('aresta com nó inexistente devolve null', () => {
    const g = graphOf([table('t', 's')], [edge('a', 't', 'nao-existe')]);
    assert.equal(resolveEdgeEndpoints(g, g.edges[0], {}), null);
  });
});
