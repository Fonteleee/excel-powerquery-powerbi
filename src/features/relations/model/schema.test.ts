// src/features/relations/model/schema.test.ts

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { FLOW_GRAPH_STORAGE_KEY, loadFlowGraph, saveFlowGraph } from './persistence';
import { MAX_NODES, parseFlowGraph } from './schema';

// Função (e não constante) para que cada teste receba um objeto novo e possa mutá-lo à vontade.
const lookupNode = () => ({
  id: 'lk',
  kind: 'transform',
  x: 10,
  y: 20,
  params: { op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['Minutos'], ifNotFound: '-' },
});

const validGraph = () => ({
  version: 1,
  nodes: [
    { id: 'a', kind: 'table', sheetId: 'agentes', x: 0, y: 0 },
    { id: 'p', kind: 'table', sheetId: 'pausas', x: 0, y: 100 },
    lookupNode(),
    { id: 'o', kind: 'output', sheetName: 'Resultado', x: 400, y: 0 },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'lk', toPort: 'in' },
    { id: 'e2', from: 'p', to: 'lk', toPort: 'lookup' },
    { id: 'e3', from: 'lk', to: 'o', toPort: 'in' },
  ],
});

const errorsOf = (input: unknown): string => {
  const result = parseFlowGraph(input);
  assert.equal(result.ok, false, 'era esperado que a validação falhasse');
  return result.ok ? '' : result.errors.join(' | ');
};

describe('parseFlowGraph: aceita', () => {
  it('um grafo válido', () => {
    const result = parseFlowGraph(validGraph());
    assert.ok(result.ok);
    assert.equal(result.graph.nodes.length, 4);
  });

  it('aresta sem toPort (assume "in")', () => {
    const g = validGraph();
    delete (g.edges[0] as Partial<(typeof g.edges)[0]>).toPort;
    const result = parseFlowGraph(g);
    assert.ok(result.ok);
    assert.equal(result.graph.edges[0].toPort, 'in');
  });

  it('descarta campos desconhecidos (anti mass-assignment)', () => {
    const g = validGraph();
    Object.assign(g.nodes[0], { isAdmin: true, role: 'owner' });
    const result = parseFlowGraph(g);
    assert.ok(result.ok);
    assert.equal('isAdmin' in result.graph.nodes[0], false);
    assert.equal('role' in result.graph.nodes[0], false);
  });
});

describe('parseFlowGraph: rejeita', () => {
  it('entrada que não é objeto', () => {
    assert.match(errorsOf(null), /objeto/);
    assert.match(errorsOf('texto'), /objeto/);
    assert.match(errorsOf([]), /objeto/);
  });

  it('versão diferente', () => {
    assert.match(errorsOf({ ...validGraph(), version: 2 }), /version/);
  });

  it('ids duplicados e ids com caracteres inválidos', () => {
    const dup = validGraph();
    dup.nodes[1].id = 'a';
    assert.match(errorsOf(dup), /duplicado/);

    const bad = validGraph();
    bad.nodes[0].id = 'a b<script>';
    assert.match(errorsOf(bad), /id inválido/);
  });

  it('aresta para nó inexistente', () => {
    const g = validGraph();
    g.edges[0].from = 'fantasma';
    assert.match(errorsOf(g), /inexistente/);
  });

  it('aresta de um nó para ele mesmo', () => {
    const g = validGraph();
    g.edges.push({ id: 'e9', from: 'o', to: 'o', toPort: 'in' });
    assert.match(errorsOf(g), /ele mesmo/);
  });

  it('ciclo entre duas transformações', () => {
    const g = {
      version: 1,
      nodes: [
        { id: 'f1', kind: 'transform', x: 0, y: 0, params: { op: 'filter', conditions: [] } },
        { id: 'f2', kind: 'transform', x: 0, y: 0, params: { op: 'filter', conditions: [] } },
      ],
      edges: [
        { id: 'c1', from: 'f1', to: 'f2', toPort: 'in' },
        { id: 'c2', from: 'f2', to: 'f1', toPort: 'in' },
      ],
    };
    assert.match(errorsOf(g), /ciclo/);
  });

  it('duas entradas na mesma porta', () => {
    const g = validGraph();
    g.edges.push({ id: 'e4', from: 'p', to: 'lk', toPort: 'in' });
    assert.match(errorsOf(g), /já tem uma entrada/);
  });

  it('porta lookup fora de uma transformação lookup', () => {
    const g = validGraph();
    g.edges[2].toPort = 'lookup';
    assert.match(errorsOf(g), /lookup/);
  });

  it('entrada em nó de tabela e saída que emite dados', () => {
    const intoTable = validGraph();
    intoTable.edges.push({ id: 'e4', from: 'a', to: 'p', toPort: 'in' });
    assert.match(errorsOf(intoTable), /não recebe entrada/);

    const fromOutput = validGraph();
    fromOutput.nodes.push({ id: 'f', kind: 'transform', x: 0, y: 0, params: { op: 'filter', conditions: [] } } as never);
    fromOutput.edges.push({ id: 'e4', from: 'o', to: 'f', toPort: 'in' });
    assert.match(errorsOf(fromOutput), /não emite dados/);
  });

  it('operação, tipo de nó, agregação e operador desconhecidos', () => {
    const op = validGraph();
    (op.nodes[2] as { params: unknown }).params = { op: 'eval', code: 'alert(1)' };
    assert.match(errorsOf(op), /operação desconhecida/);

    const kind = validGraph();
    (kind.nodes[0] as { kind: string }).kind = 'script';
    assert.match(errorsOf(kind), /tipo de nó desconhecido/);

    const agg = {
      version: 1,
      nodes: [
        {
          id: 'g',
          kind: 'transform',
          x: 0,
          y: 0,
          params: { op: 'aggregate', groupBy: ['A'], aggregations: [{ column: 'B', agg: 'MEDIAN' }] },
        },
      ],
      edges: [],
    };
    assert.match(errorsOf(agg), /valor inválido/);

    const operator = {
      version: 1,
      nodes: [
        {
          id: 'f',
          kind: 'transform',
          x: 0,
          y: 0,
          params: { op: 'filter', conditions: [{ column: 'A', operator: 'LIKE', value: '1' }] },
        },
      ],
      edges: [],
    };
    assert.match(errorsOf(operator), /valor inválido/);
  });

  it('nomes de coluna que poluem protótipos', () => {
    const forbidden = JSON.parse(
      '{"version":1,"nodes":[{"id":"f","kind":"transform","x":0,"y":0,"params":{"op":"filter","conditions":[{"column":"__proto__","operator":"=","value":"1"}]}}],"edges":[]}'
    );
    assert.match(errorsOf(forbidden), /proibido/);

    const viaConstructor = validGraph();
    (viaConstructor.nodes[2] as { params: { returns: string[] } }).params.returns = ['constructor'];
    assert.match(errorsOf(viaConstructor), /proibido/);
  });

  it('coordenadas inválidas e textos longos', () => {
    const nan = validGraph();
    nan.nodes[0].x = Number.NaN;
    assert.match(errorsOf(nan), /coordenada/);

    const huge = validGraph();
    huge.nodes[0].y = 9e9;
    assert.match(errorsOf(huge), /coordenada/);

    const longText = validGraph();
    (longText.nodes[3] as { sheetName: string }).sheetName = 'x'.repeat(300);
    assert.match(errorsOf(longText), /excede/);
  });

  it('excesso de nós', () => {
    const nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      kind: 'table',
      sheetId: 's',
      x: 0,
      y: 0,
    }));
    assert.match(errorsOf({ version: 1, nodes, edges: [] }), /mais de/);
  });
});

describe('persistência', () => {
  const g = globalThis as { localStorage?: Storage };
  const original = g.localStorage;

  const fakeStorage = (initial: Record<string, string> = {}): Storage => {
    const data = new Map(Object.entries(initial));
    return {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, String(value)),
      removeItem: key => void data.delete(key),
      clear: () => data.clear(),
      key: i => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    };
  };

  afterEach(() => {
    if (original) g.localStorage = original;
    else delete g.localStorage;
  });

  it('salva e recarrega um grafo válido', () => {
    g.localStorage = fakeStorage();
    const parsed = parseFlowGraph(validGraph());
    assert.ok(parsed.ok);
    saveFlowGraph(parsed.graph);
    assert.deepEqual(loadFlowGraph(), parsed.graph);
  });

  it('devolve grafo vazio quando o conteúdo salvo é inválido ou corrompido', () => {
    g.localStorage = fakeStorage({ [FLOW_GRAPH_STORAGE_KEY]: '{"version":1,"nodes":[{"kind":"script"}],"edges":[]}' });
    assert.equal(loadFlowGraph().nodes.length, 0);

    g.localStorage = fakeStorage({ [FLOW_GRAPH_STORAGE_KEY]: '{não é json' });
    assert.equal(loadFlowGraph().nodes.length, 0);
  });

  it('funciona sem localStorage', () => {
    delete g.localStorage;
    assert.equal(loadFlowGraph().nodes.length, 0);
    assert.doesNotThrow(() => saveFlowGraph({ version: 1, nodes: [], edges: [] }));
  });
});
