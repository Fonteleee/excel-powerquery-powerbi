// src/features/relations/sql/compile.test.ts
// Testes "golden" e estruturais do compilador de SQL (não dependem de nenhum motor de banco).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FlowGraph } from '../model/graph';
import { edge, graphOf, lookupFlow, makeSheet, outputNode, sampleSheets, table, transformNode } from '../testing/fixtures';
import { exportFlowAsSql } from './index';
import { inferColumnType } from './inputs';

const FIXED = new Date(0);

function sqlOf(graph: FlowGraph, options: Parameters<typeof exportFlowAsSql>[2] = {}, sheets = sampleSheets()): string {
  const result = exportFlowAsSql(graph, sheets, { generatedAt: FIXED, ...options });
  assert.ok(result.ok, result.ok ? '' : result.errors.join('; '));
  return result.sql;
}

const filterFlow = (): FlowGraph =>
  graphOf(
    [
      table('ta', 'agentes'),
      transformNode('f', {
        op: 'filter',
        conditions: [
          { column: 'Nome', operator: 'contains', value: '50%_a' },
          { column: 'Id', operator: '>', value: '3' },
        ],
      }),
      outputNode('out'),
    ],
    [edge('e1', 'ta', 'f'), edge('e2', 'f', 'out')]
  );

const aggregateFlow = (): FlowGraph =>
  graphOf(
    [
      table('tp', 'pausas'),
      transformNode('ag', {
        op: 'aggregate',
        groupBy: ['Motivo'],
        aggregations: [{ column: 'Minutos', agg: 'SUM', outputName: 'Total' }],
      }),
      outputNode('out', 'Resumo'),
    ],
    [edge('e1', 'tp', 'ag'), edge('e2', 'ag', 'out')]
  );

describe('compileFlowToSql: golden', () => {
  it('filtro em PostgreSQL (contains com ESCAPE e número lido de texto)', () => {
    const sql = sqlOf(filterFlow(), { dialect: 'postgres', includeInputs: false });
    const expected = [
      '-- Fluxo exportado da aba Relacionamentos (Excel PowerQuery PowerBI)',
      '-- Formato do script: v1',
      '-- Dialeto: PostgreSQL',
      '-- Gerado em: 1970-01-01T00:00:00.000Z',
      '-- AVISOS:',
      '-- - Nó "f": as colunas de texto "Id" são lidas como número só nos formatos 1234.5, 1234,5 e 1.234,5 (sem R$, % nem hh:mm).',
      '',
      '-- Fluxo',
      '',
      '-- Saída: out',
      'WITH',
      '  -- Tabela de entrada: Agentes',
      '  "_flow_ta" AS (',
      '    SELECT "Id", "Nome", "Equipe", "__flow_row"',
      '    FROM "Agentes"',
      '  ),',
      '  -- Filtro (FILTRO)',
      '  "_flow_f" AS (',
      '    SELECT s."Id", s."Nome", s."Equipe", s."__flow_row"',
      '    FROM "_flow_ta" AS s',
      "    WHERE (LOWER(BTRIM(COALESCE(s.\"Nome\", ''), ' ' || CHR(9) || CHR(10) || CHR(13) || CHR(160))) LIKE '%50!%!_a%' ESCAPE '!')",
    ];
    assert.ok(sql.startsWith(expected.join('\n')), sql);
    assert.ok(sql.includes('> 3, FALSE))'));
    assert.ok(sql.trimEnd().endsWith('ORDER BY "__flow_row";'));
  });

  it('agrupamento em DuckDB', () => {
    const sql = sqlOf(aggregateFlow(), { includeInputs: false });
    assert.ok(
      sql.includes(
        [
          '  "_flow_ag" AS (',
          '    SELECT s."Motivo",',
          '           COALESCE(ROUND(SUM(CAST(s."Minutos" AS DOUBLE)), 2), 0) AS "Total",',
          '           MIN(s."__flow_row") AS "__flow_row"',
          '    FROM "_flow_tp" AS s',
          '    GROUP BY s."Motivo"',
          '  )',
          'SELECT "Motivo", "Total"',
          'FROM "_flow_ag"',
          'ORDER BY "__flow_row";',
        ].join('\n')
      ),
      sql
    );
  });
});

describe('compileFlowToSql: estrutura', () => {
  it('lookup usa ROW_NUMBER para manter só a primeira ocorrência e LEFT JOIN', () => {
    const sql = sqlOf(lookupFlow());
    assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY .* ORDER BY r\."__flow_row"\)/);
    assert.match(sql, /WHERE x\."__flow_rank" = 1/);
    assert.match(sql, /LEFT JOIN "_flow_lk_busca" AS b ON /);
    assert.match(sql, /CASE WHEN b\."__flow_key" IS NULL THEN '-' ELSE b\."__flow_v0" END AS "Motivo"/);
  });

  it('inclui CREATE TABLE e INSERT das entradas, com a ordem original das linhas', () => {
    const sql = sqlOf(lookupFlow());
    assert.ok(sql.includes('CREATE TABLE "Agentes" ("Id" VARCHAR, "Nome" VARCHAR, "Equipe" VARCHAR, "__flow_row" BIGINT);'));
    assert.ok(sql.includes(`('A02', 'Bruno', 'Sul', 2)`));
    assert.ok(sql.includes('CREATE TABLE "Pausas" ("Agente ID" VARCHAR, "Motivo" VARCHAR, "Minutos" BIGINT, "__flow_row" BIGINT);'));
  });

  it('em PostgreSQL usa TEXT e DOUBLE PRECISION', () => {
    const sql = sqlOf(lookupFlow(), { dialect: 'postgres' });
    assert.ok(sql.includes('CREATE TABLE "Agentes" ("Id" TEXT'));
    assert.ok(!sql.includes('VARCHAR'));
  });

  it('create_table grava na aba de saída e evita colidir com tabelas de entrada', () => {
    const sheets = sampleSheets();
    const graph = lookupFlow();
    const named: FlowGraph = {
      ...graph,
      nodes: graph.nodes.map(n => (n.kind === 'output' ? { ...n, sheetName: 'agentes' } : n)),
    };
    const sql = sqlOf(named, { outputMode: 'create_table' }, sheets);
    assert.ok(sql.includes('CREATE TABLE "agentes (2)" AS'));
  });

  it('sem nó de saída usa a transformação final', () => {
    const g = filterFlow();
    const noOutput: FlowGraph = { ...g, nodes: g.nodes.filter(n => n.kind !== 'output'), edges: g.edges.filter(e => e.to !== 'out') };
    const result = exportFlowAsSql(noOutput, sampleSheets(), { generatedAt: FIXED });
    assert.ok(result.ok);
    assert.equal(result.queries.length, 1);
    assert.equal(result.queries[0].nodeId, 'f');
  });

  it('um nó de saída por consulta', () => {
    const g = lookupFlow();
    const two: FlowGraph = {
      ...g,
      nodes: [...g.nodes, outputNode('out2', 'Outra')],
      edges: [...g.edges, edge('e9', 'lk', 'out2')],
    };
    const result = exportFlowAsSql(two, sampleSheets(), { generatedAt: FIXED, outputMode: 'create_table' });
    assert.ok(result.ok);
    assert.deepEqual(result.queries.map(q => q.tableName), ['Resultado', 'Outra']);
  });

  it('cabeçalho traz data, versão do formato e dialeto', () => {
    const sql = sqlOf(lookupFlow(), { dialect: 'duckdb' });
    assert.ok(sql.includes('-- Formato do script: v1'));
    assert.ok(sql.includes('-- Dialeto: DuckDB'));
    assert.ok(sql.includes('-- Gerado em: 1970-01-01T00:00:00.000Z'));
  });

  it('avisa quando números de texto são interpretados de forma aproximada', () => {
    const sql = sqlOf(filterFlow());
    assert.ok(sql.includes('AVISOS'));
  });

  it('é determinístico', () => {
    assert.equal(sqlOf(lookupFlow()), sqlOf(lookupFlow()));
  });
});

describe('compileFlowToSql: erros', () => {
  it('coluna inexistente', () => {
    const g = lookupFlow({ sourceKey: 'Inexistente' });
    const result = exportFlowAsSql(g, sampleSheets());
    assert.ok(!result.ok);
    assert.match(result.errors.join(' '), /Inexistente/);
  });

  it('planilha inexistente', () => {
    const result = exportFlowAsSql(lookupFlow(), [sampleSheets()[0]]);
    assert.ok(!result.ok);
  });

  it('entrada desconectada', () => {
    const g = graphOf([table('ta', 'agentes'), transformNode('f', { op: 'filter', conditions: [] }), outputNode('o')], [edge('e', 'f', 'o')]);
    const result = exportFlowAsSql(g, sampleSheets());
    assert.ok(!result.ok);
    assert.match(result.errors.join(' '), /Conecte uma entrada/);
  });

  it('grafo sem saída', () => {
    const result = exportFlowAsSql(graphOf([table('ta', 'agentes')], []), sampleSheets());
    assert.ok(!result.ok);
  });

  it('agregação com nomes de saída repetidos', () => {
    const g = graphOf(
      [
        table('tp', 'pausas'),
        transformNode('ag', {
          op: 'aggregate',
          groupBy: ['Motivo'],
          aggregations: [{ column: 'Minutos', agg: 'SUM', outputName: 'Motivo' }],
        }),
        outputNode('o'),
      ],
      [edge('e1', 'tp', 'ag'), edge('e2', 'ag', 'o')]
    );
    const result = exportFlowAsSql(g, sampleSheets());
    assert.ok(!result.ok);
    assert.match(result.errors.join(' '), /repetido/);
  });

  it('cabeçalho reservado do script', () => {
    const sheets = [makeSheet('x', 'X', ['__flow_row', 'A'], [[1, 2]])];
    const g = graphOf([table('t', 'x'), outputNode('o')], [edge('e', 't', 'o')]);
    const result = exportFlowAsSql(g, sheets);
    assert.ok(!result.ok);
  });

  it('identificador maior que o limite do PostgreSQL', () => {
    const longName = 'c'.repeat(80);
    const sheets = [makeSheet('x', 'X', [longName], [[1]])];
    const g = graphOf([table('t', 'x'), outputNode('o')], [edge('e', 't', 'o')]);
    assert.ok(exportFlowAsSql(g, sheets, { dialect: 'duckdb' }).ok);
    const pg = exportFlowAsSql(g, sheets, { dialect: 'postgres' });
    assert.ok(!pg.ok);
    assert.match(pg.errors.join(' '), /excede 63 bytes/);
  });

  it('script acima do limite de tamanho é recusado', () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ['x'.repeat(6000), i]);
    const sheets = [makeSheet('x', 'X', ['T', 'N'], rows)];
    const g = graphOf([table('t', 'x'), outputNode('o')], [edge('e', 't', 'o')]);
    const result = exportFlowAsSql(g, sheets);
    assert.ok(!result.ok);
    assert.match(result.errors.join(' '), /limite/);
  });
});

describe('inferColumnType', () => {
  it('infere tipos pelos valores', () => {
    assert.equal(inferColumnType([1, 2, null]), 'bigint');
    assert.equal(inferColumnType([1, 2.5]), 'double');
    assert.equal(inferColumnType([true, false]), 'boolean');
    assert.equal(inferColumnType([1, 'a']), 'varchar');
    assert.equal(inferColumnType([1, true]), 'varchar');
    assert.equal(inferColumnType([null, undefined]), 'varchar');
    assert.equal(inferColumnType([Number.NaN]), 'varchar');
  });
});
