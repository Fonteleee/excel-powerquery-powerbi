// src/features/relations/model/legacy.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RelationEdge } from '../../../types/relations';
import { evaluateGraph } from '../runtime/evaluate';
import { materializeGraph } from '../runtime/materialize';
import { sampleSheets } from '../testing/fixtures';
import { migrateLegacyEdges } from './legacy';
import { parseFlowGraph } from './schema';

const legacy = (over: Partial<RelationEdge>): RelationEdge => ({
  id: 'edge-100',
  sourceSheetId: 'agentes',
  sourceColIdx: 0,
  targetSheetId: 'pausas',
  targetColIdx: 0,
  formulaType: 'PROCX',
  returnColIdx: 2,
  outputDestination: 'next_column',
  createdAt: 1,
  ...over,
});

describe('migrateLegacyEdges', () => {
  it('converte PROCX em tabela -> lookup -> saída com as colunas certas', () => {
    const sheets = sampleSheets();
    const { graph, converted, skipped } = migrateLegacyEdges([legacy({ ifNotFound: 'n/d' })], sheets);
    assert.equal(skipped.length, 0);
    assert.equal(converted.length, 1);
    const lookup = graph.nodes.find(n => n.kind === 'transform');
    assert.ok(lookup && lookup.kind === 'transform');
    assert.deepEqual(lookup.params, {
      op: 'lookup',
      sourceKey: 'Id',
      lookupKey: 'Agente ID',
      returns: ['Minutos'],
      ifNotFound: 'n/d',
      prefix: 'Pausas',
    });
    assert.equal(parseFlowGraph(JSON.parse(JSON.stringify(graph))).ok, true);
  });

  it('o grafo convertido calcula o mesmo valor que a fórmula antiga e não toca nas planilhas', () => {
    const sheets = sampleSheets();
    const { graph } = migrateLegacyEdges([legacy({ ifNotFound: '-' })], sheets);
    const out = graph.nodes.find(n => n.kind === 'output')!;
    const results = evaluateGraph(graph, sheets);
    const table = results.get(out.id)!.table!;
    const ana = table.rows.find(r => r.Nome === 'Ana')!;
    assert.equal(ana['Pausas - Minutos'], 60);
    const diego = table.rows.find(r => r.Nome === 'Diego')!;
    assert.equal(diego['Pausas - Minutos'], '-');

    const mat = materializeGraph(graph, sheets, results);
    assert.deepEqual(
      mat.sheets.slice(0, 2).map(s => s.id),
      ['agentes', 'pausas']
    );
    assert.equal(mat.sheets[0], sheets[0], 'planilha original intacta (mesma referência)');
    assert.equal(mat.sheets.length, 3);
  });

  it('SOMASE vira agregação na tabela de busca + lookup na origem', () => {
    const sheets = sampleSheets();
    const { graph, converted } = migrateLegacyEdges([legacy({ id: 'e-soma', formulaType: 'SOMASE' })], sheets);
    assert.equal(converted.length, 1);
    assert.equal(graph.nodes.filter(n => n.kind === 'transform').length, 2);
    const out = graph.nodes.find(n => n.kind === 'output')!;
    const table = evaluateGraph(graph, sheets).get(out.id)!.table!;
    const bruno = table.rows.find(r => r.Nome === 'Bruno')!;
    assert.equal(bruno['SUM_Minutos'], 55);
    assert.equal(table.rows.find(r => r.Nome === 'Diego')!['SUM_Minutos'], '0');
  });

  it('CONT.SE conta as ocorrências da chave', () => {
    const sheets = sampleSheets();
    const { graph } = migrateLegacyEdges([legacy({ id: 'e-cont', formulaType: 'CONT.SE' })], sheets);
    const out = graph.nodes.find(n => n.kind === 'output')!;
    const table = evaluateGraph(graph, sheets).get(out.id)!.table!;
    assert.equal(table.rows.find(r => r.Nome === 'Bruno')!['COUNT_Agente ID'], 2);
  });

  it('lista com motivo o que não tem equivalente e não cria nada para isso', () => {
    const sheets = sampleSheets();
    const { graph, converted, skipped } = migrateLegacyEdges(
      [
        legacy({ id: 'a', formulaType: 'SUM_COLS', targetSheetId: 'agentes' }),
        legacy({ id: 'b', formulaType: 'FILTRO' }),
        legacy({ id: 'c', outputDestination: 'below_row' }),
        legacy({ id: 'd', targetSheetId: 'sumiu' }),
      ],
      sheets
    );
    assert.equal(converted.length, 0);
    assert.equal(graph.nodes.length, 0);
    assert.deepEqual(skipped.map(s => s.edgeId), ['a', 'b', 'c', 'd']);
    assert.ok(skipped.every(s => s.reason.length > 5));
  });

  it('é idempotente: converter de novo não duplica nós', () => {
    const sheets = sampleSheets();
    const first = migrateLegacyEdges([legacy({})], sheets);
    const second = migrateLegacyEdges([legacy({})], sheets, first.graph);
    assert.equal(second.converted.length, 0);
    assert.equal(second.skipped[0].reason, 'Já convertida anteriormente');
    assert.equal(second.graph.nodes.length, first.graph.nodes.length);
    assert.equal(second.graph.edges.length, first.graph.edges.length);
  });

  it('ids de relações com caracteres estranhos geram ids válidos', () => {
    const sheets = sampleSheets();
    const { graph } = migrateLegacyEdges([legacy({ id: 'edge #1/ç ' })], sheets);
    assert.equal(parseFlowGraph(JSON.parse(JSON.stringify(graph))).ok, true);
  });

  it('reaproveita o nó de tabela existente em vez de duplicar', () => {
    const sheets = sampleSheets();
    const result = migrateLegacyEdges([legacy({ id: 'x1' }), legacy({ id: 'x2', returnColIdx: 1 })], sheets);
    assert.equal(result.graph.nodes.filter(n => n.kind === 'table').length, 2);
    assert.equal(result.graph.nodes.filter(n => n.kind === 'output').length, 2);
  });
});
