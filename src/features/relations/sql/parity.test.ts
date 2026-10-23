// src/features/relations/sql/parity.test.ts
// Paridade real: o SQL gerado roda no DuckDB-WASM (Node) e deve dar o MESMO resultado do evaluateGraph.
// Se o DuckDB-WASM não carregar neste ambiente, os testes são PULADOS (e dizem por quê), nunca aprovados.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph, TransformParams } from '../model/graph';
import { openNodeDuckDb, NodeDuckDb } from '../testing/duckdbNode';
import { edge, graphOf, lookupFlow, makeSheet, outputNode, sampleSheets, table, transformNode } from '../testing/fixtures';
import { canonicalCell, cellsMatch, checkSqlParity } from './parity';

let duck: NodeDuckDb | null = null;

async function resetDatabase(db: NodeDuckDb): Promise<void> {
  const tables = await db.run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'");
  for (const row of tables) await db.run(`DROP TABLE "${String(row.table_name).replace(/"/g, '""')}"`);
}

async function assertParity(graph: FlowGraph, sheets: Sheet[], expectedRows?: number): Promise<void> {
  assert.ok(duck, 'DuckDB-WASM indisponível');
  await resetDatabase(duck);
  const report = await checkSqlParity(graph, sheets, duck.run);
  assert.deepEqual(report.errors, []);
  for (const target of report.targets) {
    assert.ok(target.headersMatch, `cabeçalhos divergentes em ${target.nodeId}`);
    assert.equal(target.actualRows, target.expectedRows, `número de linhas em ${target.nodeId}`);
    assert.deepEqual(target.mismatches, [], `células divergentes em ${target.nodeId}`);
    if (expectedRows !== undefined) assert.equal(target.actualRows, expectedRows);
  }
  assert.ok(report.ok);
}

const pipeline = (...steps: { id: string; params: TransformParams }[]): FlowGraph => {
  const nodes = [table('t1', 'vendas'), ...steps.map(s => transformNode(s.id, s.params)), outputNode('out')];
  const ids = ['t1', ...steps.map(s => s.id), 'out'];
  const edges = ids.slice(1).map((to, i) => edge(`e${i}`, ids[i], to));
  return graphOf(nodes, edges);
};

const vendas = (): Sheet[] => [
  makeSheet(
    'vendas',
    'Vendas',
    ['Região', 'Produto', 'Valor', 'Qtd', 'Obs'],
    [
      ['Norte', 'Caneta', 10, 2, 'ok'],
      ['Norte', 'Lápis', 5.5, 1, '50% off'],
      ['Sul', 'Caneta', 7, 3, 'a_b'],
      ['Sul', 'Caderno', 20, null, null],
      ['Leste', 'Caneta', 12.25, 4, "d'Água"],
      [null, 'Borracha', 1, 1, 'x'],
      ['norte', 'Caneta', 3, 1, '  espaço  '],
    ]
  ),
];

describe('paridade SQL x evaluateGraph (DuckDB-WASM em Node)', () => {
  before(async () => {
    duck = await openNodeDuckDb();
  });

  after(() => duck?.close());

  it('o DuckDB-WASM carregou (senão os demais testes não provam nada)', t => {
    if (!duck) return t.skip('DuckDB-WASM não pôde ser carregado neste ambiente');
    assert.ok(duck);
  });

  it('lookup: primeira ocorrência vence, chave sem diferenciar maiúsculas, valor para não encontrado', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(lookupFlow(), sampleSheets(), 4);
  });

  it('lookup sem valor de "não encontrado" (vazio)', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(lookupFlow({ ifNotFound: '' }), sampleSheets(), 4);
  });

  it('lookup com valor numérico para não encontrado e prefixo', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(lookupFlow({ ifNotFound: '0', prefix: 'Pausa', returns: ['Minutos', 'Minutos'] }), sampleSheets(), 4);
  });

  it('lookup com chave numérica de um lado e texto do outro', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    const sheets = [
      makeSheet('a', 'Pedidos', ['Cod', 'Cliente'], [[1, 'X'], [2, 'Y'], [3, 'Z'], [null, 'W']]),
      makeSheet('b', 'Clientes', ['Código', 'Nome'], [['1', 'Um'], ['2', 'Dois'], ['2', 'Dois-bis']]),
    ];
    const graph = graphOf(
      [
        table('ta', 'a'),
        table('tb', 'b'),
        transformNode('lk', { op: 'lookup', sourceKey: 'Cod', lookupKey: 'Código', returns: ['Nome'], ifNotFound: 'N/D' }),
        outputNode('out'),
      ],
      [edge('e1', 'ta', 'lk'), edge('e2', 'tb', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
    );
    await assertParity(graph, sheets, 4);
  });

  it('agrupamento com SUM, AVG, COUNT, MIN e MAX', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(
      pipeline({
        id: 'ag',
        params: {
          op: 'aggregate',
          groupBy: ['Região'],
          aggregations: [
            { column: 'Valor', agg: 'SUM' },
            { column: 'Valor', agg: 'AVG', outputName: 'Média' },
            { column: 'Qtd', agg: 'COUNT' },
            { column: 'Valor', agg: 'MIN' },
            { column: 'Valor', agg: 'MAX' },
          ],
        },
      }),
      vendas()
    );
  });

  it('agrupamento sem colunas de grupo (total geral)', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(
      pipeline({ id: 'ag', params: { op: 'aggregate', groupBy: [], aggregations: [{ column: 'Valor', agg: 'SUM', outputName: 'Total' }] } }),
      vendas(),
      1
    );
  });

  it('agrupamento sobre colunas de texto com números no formato brasileiro', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    const sheets = [
      makeSheet('vendas', 'Vendas', ['Loja', 'Total'], [['A', '1.234,50'], ['A', '10,5'], ['B', '7'], ['B', 'abc'], ['C', null]]),
    ];
    const graph = graphOf(
      [
        table('t1', 'vendas'),
        transformNode('ag', {
          op: 'aggregate',
          groupBy: ['Loja'],
          aggregations: [{ column: 'Total', agg: 'SUM' }, { column: 'Total', agg: 'COUNT' }],
        }),
        outputNode('out'),
      ],
      [edge('e1', 't1', 'ag'), edge('e2', 'ag', 'out')]
    );
    await assertParity(graph, sheets, 3);
  });

  it('filtros: =, <>, >, <, >=, <= e contains', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    const cases: { column: string; operator: '=' | '<>' | '>' | '<' | '>=' | '<=' | 'contains'; value: string }[] = [
      { column: 'Região', operator: '=', value: 'norte' },
      { column: 'Região', operator: '<>', value: 'Norte' },
      { column: 'Valor', operator: '>', value: '5.5' },
      { column: 'Valor', operator: '<', value: '10' },
      { column: 'Valor', operator: '>=', value: '10' },
      { column: 'Valor', operator: '<=', value: '7' },
      { column: 'Valor', operator: '=', value: '10' },
      { column: 'Valor', operator: '<>', value: '10' },
      { column: 'Qtd', operator: '>', value: '1' },
      { column: 'Produto', operator: 'contains', value: 'ane' },
      { column: 'Obs', operator: 'contains', value: '50%' },
      { column: 'Obs', operator: 'contains', value: 'a_b' },
      { column: 'Obs', operator: 'contains', value: "d'ág" },
      { column: 'Obs', operator: 'contains', value: 'espaço' },
      { column: 'Região', operator: '>', value: 'abc' },
      { column: 'Obs', operator: '=', value: '' },
    ];
    for (const condition of cases) {
      await assertParity(pipeline({ id: 'f', params: { op: 'filter', conditions: [condition] } }), vendas());
    }
  });

  it('filtro com várias condições (E) e pipeline lookup -> filtro -> agrupamento', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await assertParity(
      pipeline({
        id: 'f',
        params: {
          op: 'filter',
          conditions: [
            { column: 'Valor', operator: '>=', value: '5' },
            { column: 'Produto', operator: '<>', value: 'Lápis' },
          ],
        },
      }),
      vendas()
    );

    const graph = graphOf(
      [
        table('ta', 'agentes'),
        table('tp', 'pausas'),
        transformNode('lk', { op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['Minutos'], ifNotFound: '0' }),
        transformNode('f', { op: 'filter', conditions: [{ column: 'Minutos', operator: '>', value: '5' }] }),
        transformNode('ag', {
          op: 'aggregate',
          groupBy: ['Equipe'],
          aggregations: [{ column: 'Minutos', agg: 'SUM', outputName: 'Total' }],
        }),
        outputNode('out'),
      ],
      [
        edge('e1', 'ta', 'lk'),
        edge('e2', 'tp', 'lk', 'lookup'),
        edge('e3', 'lk', 'f'),
        edge('e4', 'f', 'ag'),
        edge('e5', 'ag', 'out'),
      ]
    );
    await assertParity(graph, sampleSheets());
  });

  it('controle negativo: a paridade reprova um resultado adulterado', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    const db = duck;
    await resetDatabase(db);
    const dropLastRow = await checkSqlParity(lookupFlow(), sampleSheets(), async sql => {
      const rows = await db.run(sql);
      return sql.includes('ORDER BY') ? rows.slice(0, -1) : rows;
    });
    assert.equal(dropLastRow.ok, false);

    await resetDatabase(db);
    const alteredCell = await checkSqlParity(lookupFlow(), sampleSheets(), async sql => {
      const rows = await db.run(sql);
      return sql.includes('ORDER BY') ? rows.map(r => ({ ...r, Motivo: 'adulterado' })) : rows;
    });
    assert.equal(alteredCell.ok, false);
    assert.ok(alteredCell.targets[0].mismatches.length > 0);
  });

  it('entrada vazia', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    const sheets = [makeSheet('vendas', 'Vendas', ['Região', 'Valor'], [])];
    await assertParity(
      pipeline({ id: 'ag', params: { op: 'aggregate', groupBy: [], aggregations: [{ column: 'Valor', agg: 'SUM' }] } }),
      sheets,
      0
    );
  });
});

describe('comparação de células da paridade', () => {
  it('trata vazio como nulo, bigint como número e "60" como 60', () => {
    assert.equal(canonicalCell(''), null);
    assert.equal(canonicalCell(undefined), null);
    assert.equal(canonicalCell(10n), 10);
    assert.equal(canonicalCell('60'), 60);
    assert.equal(canonicalCell('007'), '007');
    assert.ok(cellsMatch(60, '60'));
    assert.ok(cellsMatch(0.1 + 0.2, 0.3));
    assert.ok(!cellsMatch('a', 'A'));
    assert.ok(!cellsMatch(1, 2));
  });
});
