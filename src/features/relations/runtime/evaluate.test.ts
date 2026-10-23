// src/features/relations/runtime/evaluate.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { downstreamOf } from '../model/dag';
import { FlowGraph, FlowNode, TransformParams } from '../model/graph';
import { edge, graphOf, makeSheet, sampleSheets, table } from '../testing/fixtures';
import { evaluateGraph, previewTable } from './evaluate';

const transform = (id: string, params: TransformParams): FlowNode => ({ id, kind: 'transform', x: 0, y: 0, params });
const output = (id: string, sheetName = 'Resultado'): FlowNode => ({ id, kind: 'output', x: 0, y: 0, sheetName });

const lookupParams: TransformParams = {
  op: 'lookup',
  sourceKey: 'Id',
  lookupKey: 'Agente ID',
  returns: ['Motivo', 'Minutos'],
  ifNotFound: '-',
};

const lookupGraph = (): FlowGraph =>
  graphOf(
    [table('ta', 'agentes'), table('tp', 'pausas'), transform('lk', lookupParams), output('out')],
    [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
  );

describe('evaluateGraph: nó de tabela', () => {
  it('lê cabeçalhos e linhas da planilha', () => {
    const results = evaluateGraph(graphOf([table('ta', 'agentes')], []), sampleSheets());
    const r = results.get('ta')!;
    assert.equal(r.error, null);
    assert.equal(r.table!.rows.length, 4);
    assert.deepEqual(r.table!.headers.slice(0, 3), ['Id', 'Nome', 'Equipe']);
  });

  it('ignora colunas reservadas vazias e sem cabeçalho', () => {
    const r = evaluateGraph(graphOf([table('ta', 'agentes')], []), sampleSheets()).get('ta')!;
    assert.deepEqual(r.table!.headers, ['Id', 'Nome', 'Equipe']);
    assert.deepEqual(Object.keys(r.table!.rows[0]), ['Id', 'Nome', 'Equipe']);
  });

  it('mantém coluna sem cabeçalho quando ela tem dados', () => {
    const sheet = makeSheet('s', 'S', ['A', ''], [['x', 'dado']]);
    const r = evaluateGraph(graphOf([table('t', 's')], []), [sheet]).get('t')!;
    assert.equal(r.table!.headers.length, 2);
  });

  it('erro claro quando a planilha não existe', () => {
    const results = evaluateGraph(graphOf([table('t', 'sumiu')], []), sampleSheets());
    assert.match(results.get('t')!.error!, /não encontrada/);
  });

  it('recusa cabeçalho que polui protótipo', () => {
    const sheet = makeSheet('s', 'Suja', ['__proto__', 'B'], [['x', 1]]);
    const results = evaluateGraph(graphOf([table('t', 's')], []), [sheet]);
    assert.match(results.get('t')!.error!, /proibido/);
  });
});

describe('evaluateGraph: lookup (PROCX)', () => {
  const results = evaluateGraph(lookupGraph(), sampleSheets());
  const lk = results.get('lk')!;

  it('acrescenta as colunas de retorno e ignora maiúsculas/minúsculas na chave', () => {
    assert.equal(lk.error, null);
    assert.deepEqual(lk.table!.headers.slice(-2), ['Motivo', 'Minutos']);
    const ana = lk.table!.rows.find(r => r.Nome === 'Ana')!;
    assert.equal(ana.Motivo, 'Almoço');
    assert.equal(ana.Minutos, 60);
  });

  it('usa a primeira ocorrência quando a chave de busca repete', () => {
    const bruno = lk.table!.rows.find(r => r.Nome === 'Bruno')!;
    assert.equal(bruno.Motivo, 'Banheiro');
    assert.equal(bruno.Minutos, 10);
  });

  it('preenche "se não encontrado" para chaves sem correspondência', () => {
    const carla = lk.table!.rows.find(r => r.Nome === 'Carla')!;
    assert.equal(carla.Motivo, '-');
    assert.equal(carla.Minutos, '-');
  });

  it('calcula o pré-join scan: match, órfãos e cardinalidade', () => {
    assert.deepEqual(lk.lookup, {
      sourceRows: 4,
      matched: 2,
      orphans: 2,
      matchRate: 50,
      duplicateLookupKeys: 1,
      cardinality: '1:N',
    });
  });

  it('evita colisão de nomes de coluna', () => {
    const params: TransformParams = { ...lookupParams, returns: ['Agente ID', 'Agente ID'] } as TransformParams;
    const g = graphOf(
      [table('ta', 'agentes'), table('tp', 'pausas'), transform('lk', params)],
      [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup')]
    );
    const headers = evaluateGraph(g, sampleSheets()).get('lk')!.table!.headers;
    assert.equal(new Set(headers).size, headers.length);
  });

  it('aplica prefixo às colunas novas', () => {
    const g = lookupGraph();
    (g.nodes[2] as { params: TransformParams }).params = { ...lookupParams, prefix: 'Pausa' } as TransformParams;
    const headers = evaluateGraph(g, sampleSheets()).get('lk')!.table!.headers;
    assert.ok(headers.includes('Pausa - Motivo'));
  });

  it('classifica N:1 quando só a origem repete a chave', () => {
    const sheets = [
      makeSheet('vendas', 'Vendas', ['Agente', 'Valor'], [['A01', 10], ['A01', 20], ['A02', 5]]),
      makeSheet('cad', 'Cadastro', ['Id', 'Equipe'], [['A01', 'Norte'], ['A02', 'Sul']]),
    ];
    const params: TransformParams = {
      op: 'lookup',
      sourceKey: 'Agente',
      lookupKey: 'Id',
      returns: ['Equipe'],
      ifNotFound: '',
    };
    const g = graphOf(
      [table('tv', 'vendas'), table('tc', 'cad'), transform('lk', params)],
      [edge('e1', 'tv', 'lk'), edge('e2', 'tc', 'lk', 'lookup')]
    );
    const stats = evaluateGraph(g, sheets).get('lk')!.lookup!;
    assert.equal(stats.cardinality, 'N:1');
    assert.equal(stats.matchRate, 100);
  });

  it('erro quando falta a tabela de busca ou a coluna não existe', () => {
    const noLookup = graphOf([table('ta', 'agentes'), transform('lk', lookupParams)], [edge('e1', 'ta', 'lk')]);
    assert.match(evaluateGraph(noLookup, sampleSheets()).get('lk')!.error!, /tabela de busca/);

    const g = lookupGraph();
    (g.nodes[2] as { params: TransformParams }).params = { ...lookupParams, returns: ['Inexistente'] } as TransformParams;
    assert.match(evaluateGraph(g, sampleSheets()).get('lk')!.error!, /"Inexistente"/);
  });
});

describe('evaluateGraph: aggregate e filter', () => {
  it('soma por grupo (SOMASE)', () => {
    const g = graphOf(
      [
        table('tp', 'pausas'),
        transform('ag', {
          op: 'aggregate',
          groupBy: ['Agente ID'],
          aggregations: [{ column: 'Minutos', agg: 'SUM' }],
        }),
      ],
      [edge('e1', 'tp', 'ag')]
    );
    const r = evaluateGraph(g, sampleSheets()).get('ag')!;
    assert.deepEqual(r.table!.headers, ['Agente ID', 'SUM_Minutos']);
    assert.equal(r.table!.rows.find(x => x['Agente ID'] === 'A02')!.SUM_Minutos, 55);
    assert.equal(r.table!.rows.length, 3);
  });

  it('agregação de tabela vazia mantém os cabeçalhos', () => {
    const empty = makeSheet('vazia', 'Vazia', ['Grupo', 'Valor'], []);
    const g = graphOf(
      [
        table('t', 'vazia'),
        transform('ag', { op: 'aggregate', groupBy: ['Grupo'], aggregations: [{ column: 'Valor', agg: 'SUM' }] }),
      ],
      [edge('e1', 't', 'ag')]
    );
    const r = evaluateGraph(g, [empty]).get('ag')!;
    assert.deepEqual(r.table!.headers, ['Grupo', 'SUM_Valor']);
    assert.equal(r.table!.rows.length, 0);
  });

  it('filtra linhas (FILTRO)', () => {
    const g = graphOf(
      [
        table('tp', 'pausas'),
        transform('fl', { op: 'filter', conditions: [{ column: 'Minutos', operator: '>', value: '20' }] }),
      ],
      [edge('e1', 'tp', 'fl')]
    );
    const r = evaluateGraph(g, sampleSheets()).get('fl')!;
    assert.deepEqual(r.table!.rows.map(x => x.Minutos), [60, 45, 30]);
  });

  it('erro quando a coluna do critério não existe', () => {
    const g = graphOf(
      [table('tp', 'pausas'), transform('fl', { op: 'filter', conditions: [{ column: 'Nada', operator: '=', value: '1' }] })],
      [edge('e1', 'tp', 'fl')]
    );
    assert.match(evaluateGraph(g, sampleSheets()).get('fl')!.error!, /"Nada"/);
  });
});

describe('evaluateGraph: encadeamento', () => {
  const chain = (): FlowGraph =>
    graphOf(
      [
        table('ta', 'agentes'),
        table('tp', 'pausas'),
        transform('ag', { op: 'aggregate', groupBy: ['Agente ID'], aggregations: [{ column: 'Minutos', agg: 'SUM' }] }),
        transform('lk', { op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['SUM_Minutos'], ifNotFound: '0' }),
        output('out'),
      ],
      [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'ag'), edge('e3', 'ag', 'lk', 'lookup'), edge('e4', 'lk', 'out')]
    );

  it('agrega pausas e cruza o total com os agentes', () => {
    const r = evaluateGraph(chain(), sampleSheets()).get('out')!;
    assert.equal(r.error, null);
    const byName = Object.fromEntries(r.table!.rows.map(x => [x.Nome as string, x.SUM_Minutos]));
    assert.deepEqual(byName, { Ana: 60, Bruno: 55, Carla: '0', Diego: '0' });
  });

  it('propaga o erro para os nós seguintes', () => {
    const g = chain();
    (g.nodes[2] as { params: TransformParams }).params = {
      op: 'aggregate',
      groupBy: ['Coluna Errada'],
      aggregations: [{ column: 'Minutos', agg: 'SUM' }],
    };
    const results = evaluateGraph(g, sampleSheets());
    assert.match(results.get('ag')!.error!, /Coluna Errada/);
    assert.match(results.get('lk')!.error!, /tabela de busca tem erro/);
    assert.match(results.get('out')!.error!, /entrada tem erro/);
  });

  it('preserva o motivo original nos nós que herdaram o erro', () => {
    const g = chain();
    (g.nodes[2] as { params: TransformParams }).params = {
      op: 'aggregate',
      groupBy: ['Coluna Errada'],
      aggregations: [{ column: 'Minutos', agg: 'SUM' }],
    };
    const results = evaluateGraph(g, sampleSheets());
    assert.equal(results.get('ag')!.rootCause, undefined);
    assert.match(results.get('out')!.rootCause!, /Coluna Errada/);
  });

  it('nó sem entrada conectada avisa o que falta', () => {
    const results = evaluateGraph(graphOf([output('o')], []), sampleSheets());
    assert.match(results.get('o')!.error!, /Conecte/);
  });

  it('grafo com ciclo não executa', () => {
    const g = graphOf(
      [transform('f1', { op: 'filter', conditions: [] }), transform('f2', { op: 'filter', conditions: [] })],
      [edge('c1', 'f1', 'f2'), edge('c2', 'f2', 'f1')]
    );
    const results = evaluateGraph(g, []);
    assert.match(results.get('f1')!.error!, /ciclo/);
  });
});

describe('evaluateGraph: recálculo incremental', () => {
  it('reaproveita nós que não dependem da mudança', () => {
    const graph = lookupGraph();
    const sheets = sampleSheets();
    const first = evaluateGraph(graph, sheets);

    const changed = sheets.map(s =>
      s.id === 'pausas' ? makeSheet('pausas', 'Pausas', ['Agente ID', 'Motivo', 'Minutos'], [['A03', 'Treino', 5]]) : s
    );
    const dirty = downstreamOf(graph, ['tp']);
    const second = evaluateGraph(graph, changed, { previous: first, dirty });

    assert.equal(second.get('ta'), first.get('ta'), 'tabela de agentes deve ser reaproveitada (mesma referência)');
    assert.notEqual(second.get('lk'), first.get('lk'));
    assert.equal(second.get('lk')!.lookup!.matched, 1);
    const carla = second.get('out')!.table!.rows.find(r => r.Nome === 'Carla')!;
    assert.equal(carla.Motivo, 'Treino');
  });
});

describe('previewTable', () => {
  it('limita a amostra sem alterar os cabeçalhos', () => {
    const table10 = evaluateGraph(lookupGraph(), sampleSheets()).get('lk')!.table!;
    const sample = previewTable(table10, 2);
    assert.equal(sample.rows.length, 2);
    assert.deepEqual(sample.headers, table10.headers);
    assert.equal(previewTable(table10, -5).rows.length, 0);
  });
});
