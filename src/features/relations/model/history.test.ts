// src/features/relations/model/history.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyGraph, FlowGraph } from './graph';
import { addOutputNode } from './editor';
import { canRedo, canUndo, COALESCE_WINDOW_MS, createHistory, recordEdit, redo, undo } from './history';

const g0 = createEmptyGraph();
const withOut = (name: string): FlowGraph => {
  const r = addOutputNode(g0, name, { x: 0, y: 0 });
  if (!r.ok) throw new Error(r.error);
  return r.graph;
};

describe('histórico do grafo', () => {
  it('desfaz e refaz na ordem, e uma edição nova limpa o refazer', () => {
    const g1 = withOut('A');
    const g2 = withOut('B');
    let h = recordEdit(createHistory(), g0, { now: 0 });
    h = recordEdit(h, g1, { now: 10 });
    assert.ok(canUndo(h) && !canRedo(h));
    const u1 = undo(h, g2)!;
    assert.equal(u1.graph, g1);
    const u2 = undo(u1.history, u1.graph)!;
    assert.equal(u2.graph, g0);
    assert.equal(undo(u2.history, u2.graph), null);
    const r1 = redo(u2.history, u2.graph)!;
    assert.equal(r1.graph, g1);
    assert.ok(canRedo(r1.history));
    const edited = recordEdit(r1.history, g1, { now: 20 });
    assert.equal(canRedo(edited), false);
  });

  it('limita o tamanho descartando os mais antigos', () => {
    let h = createHistory();
    const graphs = Array.from({ length: 6 }, (_, i) => withOut(`G${i}`));
    graphs.forEach((g, i) => { h = recordEdit(h, g, { now: i, limit: 3 }); });
    assert.equal(h.past.length, 3);
    assert.equal(h.past[0], graphs[3]);
  });

  it('agrupa edições contínuas com a mesma chave dentro da janela', () => {
    let h = recordEdit(createHistory(), g0, { coalesceKey: 'move:1', now: 0 });
    h = recordEdit(h, withOut('x'), { coalesceKey: 'move:1', now: 100 });
    h = recordEdit(h, withOut('y'), { coalesceKey: 'move:1', now: 200 });
    assert.equal(h.past.length, 1);
    assert.equal(h.past[0], g0);
    h = recordEdit(h, withOut('z'), { coalesceKey: 'move:2', now: 300 });
    assert.equal(h.past.length, 2);
    h = recordEdit(h, withOut('w'), { coalesceKey: 'move:2', now: 300 + COALESCE_WINDOW_MS + 1 });
    assert.equal(h.past.length, 3);
  });
});
