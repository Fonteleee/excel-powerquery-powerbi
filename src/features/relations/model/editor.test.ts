// src/features/relations/model/editor.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graphOf, table } from '../testing/fixtures';
import {
  addOutputNode,
  addTableNode,
  addTransformNode,
  changeTransformOp,
  connect,
  connectionError,
  defaultParams,
  findFreeSpot,
  graphBounds,
  moveNode,
  removeEdge,
  removeNode,
  syncTableNodes,
  uniqueId,
} from './editor';
import { createEmptyGraph, FlowGraph } from './graph';
import { parseFlowGraph } from './schema';

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.equal(result.ok, true);
  return result as Extract<T, { ok: true }>;
}

function baseGraph(): FlowGraph {
  let g = createEmptyGraph();
  g = ok(addTableNode(g, 'agentes', { x: 0, y: 0 })).graph;
  g = ok(addTableNode(g, 'pausas', { x: 0, y: 400 })).graph;
  return g;
}

describe('uniqueId', () => {
  it('escolhe o menor número livre', () => {
    assert.equal(uniqueId('trf', []), 'trf-1');
    assert.equal(uniqueId('trf', ['trf-1', 'trf-2']), 'trf-3');
    assert.equal(uniqueId('trf', ['trf-2']), 'trf-1');
  });
});

describe('adicionar nós', () => {
  it('não duplica o nó de tabela da mesma planilha', () => {
    const g = baseGraph();
    const again = ok(addTableNode(g, 'agentes', { x: 5, y: 5 }));
    assert.equal(again.graph.nodes.length, 2);
    assert.equal(again.id, 'tbl-1');
  });

  it('gera ids válidos para o validador do grafo', () => {
    let g = baseGraph();
    const t = ok(addTransformNode(g, defaultParams('lookup'), { x: 400, y: 0 }));
    g = t.graph;
    const o = ok(addOutputNode(g, '  Resultado final  ', { x: 800, y: 0 }));
    g = o.graph;
    g = ok(connect(g, 'tbl-1', t.id, 'in')).graph;
    g = ok(connect(g, 'tbl-2', t.id, 'lookup')).graph;
    g = ok(connect(g, t.id, o.id, 'in')).graph;
    // lookup sem chaves definidas é inválido no schema; preenche para validar o restante
    g = {
      ...g,
      nodes: g.nodes.map(n =>
        n.kind === 'transform'
          ? { ...n, params: { op: 'lookup' as const, sourceKey: 'Id', lookupKey: 'Agente ID', returns: [], ifNotFound: '' } }
          : n
      ),
    };
    const parsed = parseFlowGraph(JSON.parse(JSON.stringify(g)));
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.errors.join('; '));
    const node = g.nodes.find(n => n.id === o.id);
    assert.equal(node?.kind === 'output' && node.sheetName, 'Resultado final');
  });

  it('afasta o novo nó quando o lugar está ocupado', () => {
    const g = baseGraph();
    const spot = findFreeSpot(g, { x: 0, y: 0 });
    assert.equal(spot.x, 0);
    assert.ok(spot.y > 0);
    const clash = g.nodes.some(n => Math.abs(n.x - spot.x) < 150 && Math.abs(n.y - spot.y) < 90);
    assert.equal(clash, false);
  });

  it('respeita o limite de nós', () => {
    const nodes = Array.from({ length: 500 }, (_, i) => table(`n${i}`, `s${i}`, i * 1000, 0));
    const full = graphOf(nodes, []);
    const result = addOutputNode(full, 'x', { x: 0, y: 5000 });
    assert.equal(result.ok, false);
  });
});

describe('moveNode', () => {
  it('é imutável e devolve o mesmo objeto quando nada muda', () => {
    const g = baseGraph();
    const moved = moveNode(g, 'tbl-1', 50.4, 70.6);
    assert.notEqual(moved, g);
    assert.deepEqual([moved.nodes[0].x, moved.nodes[0].y], [50, 71]);
    assert.deepEqual([g.nodes[0].x, g.nodes[0].y], [0, 0]);
    assert.equal(moveNode(g, 'tbl-1', 0, 0), g);
  });

  it('limita coordenadas absurdas e ignora NaN', () => {
    const g = moveNode(baseGraph(), 'tbl-1', 9e12, Number.NaN);
    assert.equal(g.nodes[0].x, 1_000_000);
    assert.equal(g.nodes[0].y, 0);
  });
});

describe('connect', () => {
  const withLookup = () => {
    const t = ok(addTransformNode(baseGraph(), defaultParams('lookup'), { x: 500, y: 0 }));
    return { graph: t.graph, id: t.id };
  };

  it('liga tabela à entrada e à busca de um lookup', () => {
    const { graph, id } = withLookup();
    const a = ok(connect(graph, 'tbl-1', id, 'in'));
    const b = ok(connect(a.graph, 'tbl-2', id, 'lookup'));
    assert.equal(b.graph.edges.length, 2);
  });

  it('substitui a aresta que ocupava a mesma porta', () => {
    const { graph, id } = withLookup();
    const a = ok(connect(graph, 'tbl-1', id, 'in')).graph;
    const b = ok(connect(a, 'tbl-2', id, 'in')).graph;
    assert.equal(b.edges.length, 1);
    assert.equal(b.edges[0].from, 'tbl-2');
  });

  it('é idempotente para a mesma ligação', () => {
    const { graph, id } = withLookup();
    const a = ok(connect(graph, 'tbl-1', id, 'in'));
    const b = ok(connect(a.graph, 'tbl-1', id, 'in'));
    assert.equal(b.graph, a.graph);
    assert.equal(b.id, a.id);
  });

  it('recusa ligações inválidas com motivo', () => {
    const { graph, id } = withLookup();
    const out = ok(addOutputNode(graph, 'S', { x: 900, y: 0 }));
    assert.match(connectionError(out.graph, 'tbl-1', 'tbl-2', 'in') ?? '', /não recebe entrada/);
    assert.match(connectionError(out.graph, id, id, 'in') ?? '', /ele mesmo/);
    assert.match(connectionError(out.graph, out.id, id, 'in') ?? '', /não emite/);
    assert.match(connectionError(out.graph, 'tbl-1', out.id, 'lookup') ?? '', /porta/);
    const filter = ok(addTransformNode(out.graph, defaultParams('filter'), { x: 500, y: 600 }));
    assert.match(connectionError(filter.graph, 'tbl-1', filter.id, 'lookup') ?? '', /busca/);
    assert.match(connectionError(filter.graph, 'nada', filter.id, 'in') ?? '', /inexistente/);
  });

  it('recusa ciclos', () => {
    let g = baseGraph();
    const a = ok(addTransformNode(g, defaultParams('filter'), { x: 400, y: 0 }));
    const b = ok(addTransformNode(a.graph, defaultParams('filter'), { x: 800, y: 0 }));
    g = ok(connect(b.graph, 'tbl-1', a.id, 'in')).graph;
    g = ok(connect(g, a.id, b.id, 'in')).graph;
    assert.match(connectionError(g, b.id, a.id, 'in') ?? '', /ciclo/);
    assert.equal(connect(g, b.id, a.id, 'in').ok, false);
  });

  it('trocar a fonte de uma porta não conta a aresta substituída para o ciclo', () => {
    let g = baseGraph();
    const a = ok(addTransformNode(g, defaultParams('filter'), { x: 400, y: 0 }));
    const b = ok(addTransformNode(a.graph, defaultParams('filter'), { x: 800, y: 0 }));
    g = ok(connect(b.graph, 'tbl-1', a.id, 'in')).graph;
    g = ok(connect(g, a.id, b.id, 'in')).graph;
    // b passa a alimentar a (que antes era a fonte de b) apenas depois de b perder a entrada de a
    g = ok(connect(g, 'tbl-2', b.id, 'in')).graph;
    assert.equal(connectionError(g, b.id, a.id, 'in'), null);
  });
});

describe('remover', () => {
  it('removeNode leva junto as arestas ligadas ao nó', () => {
    const t = ok(addTransformNode(baseGraph(), defaultParams('lookup'), { x: 500, y: 0 }));
    let g = ok(connect(t.graph, 'tbl-1', t.id, 'in')).graph;
    g = ok(connect(g, 'tbl-2', t.id, 'lookup')).graph;
    const after = removeNode(g, t.id);
    assert.equal(after.edges.length, 0);
    assert.equal(after.nodes.length, 2);
    assert.equal(g.edges.length, 2);
  });

  it('removeEdge remove só a aresta pedida', () => {
    const t = ok(addTransformNode(baseGraph(), defaultParams('lookup'), { x: 500, y: 0 }));
    const g = ok(connect(ok(connect(t.graph, 'tbl-1', t.id, 'in')).graph, 'tbl-2', t.id, 'lookup')).graph;
    const after = removeEdge(g, g.edges[0].id);
    assert.equal(after.edges.length, 1);
  });
});

describe('changeTransformOp', () => {
  it('troca os parâmetros e solta a porta de busca ao sair de lookup', () => {
    const t = ok(addTransformNode(baseGraph(), defaultParams('lookup'), { x: 500, y: 0 }));
    let g = ok(connect(t.graph, 'tbl-1', t.id, 'in')).graph;
    g = ok(connect(g, 'tbl-2', t.id, 'lookup')).graph;
    const agg = changeTransformOp(g, t.id, 'aggregate');
    const node = agg.nodes.find(n => n.id === t.id);
    assert.equal(node?.kind === 'transform' && node.params.op, 'aggregate');
    assert.equal(agg.edges.length, 1);
    assert.equal(agg.edges[0].toPort, 'in');
  });

  it('não muda nada quando a operação é a mesma', () => {
    const t = ok(addTransformNode(baseGraph(), defaultParams('filter'), { x: 500, y: 0 }));
    assert.equal(changeTransformOp(t.graph, t.id, 'filter'), t.graph);
  });
});

describe('syncTableNodes', () => {
  const sheets = [
    { id: 'agentes', name: 'Agentes' },
    { id: 'pausas', name: 'Pausas' },
    { id: 'flow-out-out-1', name: 'Resultado' },
  ];

  it('cria nós para planilhas novas e ignora abas geradas pelo fluxo', () => {
    const { graph, known } = syncTableNodes(createEmptyGraph(), sheets, []);
    assert.equal(graph.nodes.length, 2);
    assert.deepEqual([...known].sort(), ['agentes', 'pausas']);
  });

  it('não recria um nó que o usuário removeu', () => {
    const first = syncTableNodes(createEmptyGraph(), sheets, []);
    const removed = removeNode(first.graph, 'tbl-1');
    const again = syncTableNodes(removed, sheets, first.known);
    assert.equal(again.graph.nodes.length, 1);
  });

  it('acrescenta apenas a planilha nova abaixo dos nós existentes', () => {
    const first = syncTableNodes(createEmptyGraph(), sheets, []);
    const more = syncTableNodes(first.graph, [...sheets, { id: 'vendas', name: 'Vendas' }], first.known);
    assert.equal(more.graph.nodes.length, 3);
    const added = more.graph.nodes[2];
    assert.ok(added.y >= Math.max(...first.graph.nodes.map(n => n.y)));
  });
});

describe('graphBounds', () => {
  it('é null para grafo vazio e envolve os nós caso contrário', () => {
    assert.equal(graphBounds(createEmptyGraph()), null);
    const b = graphBounds(baseGraph(), { width: 10, height: 20 })!;
    assert.deepEqual(b, { minX: 0, minY: 0, maxX: 10, maxY: 420 });
  });
});
