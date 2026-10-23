// src/features/relations/model/dirty.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edge, graphOf, table } from '../testing/fixtures';
import { dirtyNodes } from './dirty';
import { moveNode } from './editor';
import { FlowGraph, FlowNode } from './graph';

const filterNode = (id: string, value: string): FlowNode => ({
  id,
  kind: 'transform',
  x: 0,
  y: 0,
  params: { op: 'filter', conditions: [{ column: 'Id', operator: '=', value }] },
});
const outNode = (id: string): FlowNode => ({ id, kind: 'output', x: 0, y: 0, sheetName: id });

const chain = (value = 'A01'): FlowGraph =>
  graphOf(
    [table('t', 'agentes'), filterNode('f', value), outNode('o'), table('solto', 'pausas')],
    [edge('e1', 't', 'f'), edge('e2', 'f', 'o')]
  );

describe('dirtyNodes', () => {
  it('não marca nada quando só a posição muda', () => {
    const g = chain();
    assert.equal(dirtyNodes(g, moveNode(g, 'f', 300, 300)).size, 0);
  });

  it('marca o nó alterado e os que dependem dele, mas não os independentes', () => {
    const dirty = dirtyNodes(chain('A01'), chain('A02'));
    assert.deepEqual([...dirty].sort(), ['f', 'o']);
  });

  it('marca nó novo e seus dependentes', () => {
    const prev = graphOf([table('t', 'agentes'), outNode('o')], []);
    const next = graphOf([table('t', 'agentes'), outNode('o')], [edge('e1', 't', 'o')]);
    assert.deepEqual([...dirtyNodes(prev, next)], ['o']);
  });

  it('marca o destino quando a aresta de entrada é removida', () => {
    const dirty = dirtyNodes(chain(), graphOf(chain().nodes, [edge('e2', 'f', 'o')]));
    assert.ok(dirty.has('f') && dirty.has('o'));
    assert.equal(dirty.has('t'), false);
  });

  it('marca quando a tabela de origem aponta para outra planilha', () => {
    const prev = graphOf([table('t', 'a')], []);
    const next = graphOf([table('t', 'b')], []);
    assert.deepEqual([...dirtyNodes(prev, next)], ['t']);
  });
});
