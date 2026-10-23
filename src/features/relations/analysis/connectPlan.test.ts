// src/features/relations/analysis/connectPlan.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addTableNode } from '../model/editor';
import { createEmptyGraph, FlowGraph } from '../model/graph';
import { parseFlowGraph } from '../model/schema';
import { evaluateGraph } from '../runtime/evaluate';
import { sampleSheets } from '../testing/fixtures';
import { createConnectContext } from './connectContext';
import { applyConnectOperation, pickGroupKey } from './connectPlan';
import { ConnectOperation } from './suggestions';

function setup() {
  let graph: FlowGraph = createEmptyGraph();
  for (const [i, id] of ['agentes', 'pausas'].entries()) {
    const added = addTableNode(graph, id, { x: 0, y: i * 400 });
    assert.ok(added.ok);
    graph = added.graph;
  }
  const sheets = sampleSheets();
  const results = evaluateGraph(graph, sheets);
  const ctx = createConnectContext(graph, results, new Map(sheets.map(s => [s.id, s.name])));
  return { graph, sheets, ctx };
}

const agentes = { nodeId: 'tbl-1' };
const pausas = { nodeId: 'tbl-2' };

function run(op: ConnectOperation, from: { nodeId: string; column: string }, to: { nodeId: string; column: string }) {
  const { graph, sheets, ctx } = setup();
  const outcome = applyConnectOperation(graph, from, to, op, ctx);
  assert.ok(outcome.ok, outcome.ok ? '' : outcome.error);
  const parsed = parseFlowGraph(JSON.parse(JSON.stringify(outcome.graph)));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const results = evaluateGraph(outcome.graph, sheets);
  return { outcome, results };
}

describe('applyConnectOperation', () => {
  it('lookup: a origem vira a chave, o destino define a coluna de busca e uma coluna de retorno é escolhida', () => {
    const { outcome, results } = run('lookup', { ...agentes, column: 'Id' }, { ...pausas, column: 'Agente ID' });
    const lookup = outcome.graph.nodes.find(n => n.kind === 'transform');
    assert.ok(lookup && lookup.kind === 'transform' && lookup.params.op === 'lookup');
    assert.equal(lookup.params.sourceKey, 'Id');
    assert.equal(lookup.params.lookupKey, 'Agente ID');
    assert.deepEqual(lookup.params.returns, ['Motivo']);
    const table = results.get(outcome.outputId)!.table!;
    assert.equal(table.rows.find(r => r.Nome === 'Ana')!.Motivo, 'Almoço');
    assert.equal(outcome.createdIds.length, 2);
  });

  it('soma entre tabelas vira agregação na tabela de destino + busca na origem (SOMASE)', () => {
    const { outcome, results } = run('sum', { ...agentes, column: 'Id' }, { ...pausas, column: 'Minutos' });
    const kinds = outcome.graph.nodes.filter(n => n.kind === 'transform').map(n => n.kind === 'transform' && n.params.op);
    assert.deepEqual(kinds, ['aggregate', 'lookup']);
    const agg = outcome.graph.nodes.find(n => n.kind === 'transform' && n.params.op === 'aggregate');
    assert.ok(agg && agg.kind === 'transform' && agg.params.op === 'aggregate');
    assert.deepEqual(agg.params.groupBy, ['Agente ID'], 'agrupa pela coluna-chave de mesmo tipo');
    const table = results.get(outcome.outputId)!.table!;
    assert.equal(table.rows.find(r => r.Nome === 'Bruno')!['SUM_Minutos'], 55);
    assert.equal(table.rows.find(r => r.Nome === 'Diego')!['SUM_Minutos'], '0');
  });

  it('média e contagem usam a mesma estrutura', () => {
    const avg = run('avg', { ...agentes, column: 'Id' }, { ...pausas, column: 'Minutos' });
    assert.equal(avg.results.get(avg.outcome.outputId)!.table!.rows.find(r => r.Nome === 'Bruno')!['AVG_Minutos'], 27.5);
    const count = run('count', { ...agentes, column: 'Id' }, { ...pausas, column: 'Minutos' });
    assert.equal(count.results.get(count.outcome.outputId)!.table!.rows.find(r => r.Nome === 'Bruno')!['COUNT_Minutos'], 2);
  });

  it('na mesma tabela agrega agrupando pelo campo de origem', () => {
    const { outcome, results } = run('sum', { ...pausas, column: 'Agente ID' }, { ...pausas, column: 'Minutos' });
    assert.equal(outcome.graph.nodes.filter(n => n.kind === 'transform').length, 1);
    const table = results.get(outcome.outputId)!.table!;
    assert.deepEqual(table.headers, ['Agente ID', 'SUM_Minutos']);
    assert.equal(table.rows.find(r => r['Agente ID'] === 'A02')!['SUM_Minutos'], 55);
  });

  it('mesma coluna nos dois lados gera total geral', () => {
    const { outcome, results } = run('sum', { ...pausas, column: 'Minutos' }, { ...pausas, column: 'Minutos' });
    const table = results.get(outcome.outputId)!.table!;
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0]['SUM_Minutos'], 145);
  });

  it('filtro parte do campo de origem com valor inicial seguro', () => {
    const num = run('filter', { ...pausas, column: 'Minutos' }, { ...agentes, column: 'Id' });
    const t = num.outcome.graph.nodes.find(n => n.kind === 'transform');
    assert.ok(t && t.kind === 'transform' && t.params.op === 'filter');
    assert.deepEqual(t.params.conditions[0], { column: 'Minutos', operator: '>=', value: '10' });
    assert.equal(num.results.get(num.outcome.outputId)!.table!.rows.length, 4, 'valor inicial não esvazia o resultado');

    const txt = run('filter', { ...agentes, column: 'Equipe' }, { ...pausas, column: 'Motivo' });
    const f = txt.outcome.graph.nodes.find(n => n.kind === 'transform');
    assert.ok(f && f.kind === 'transform' && f.params.op === 'filter');
    assert.equal(f.params.conditions[0].operator, 'contains');
    assert.equal(f.params.conditions[0].value, 'Norte');
  });

  it('erro claro quando a tabela não está no fluxo', () => {
    const { graph, ctx } = setup();
    const outcome = applyConnectOperation(graph, { nodeId: 'zzz', column: 'a' }, { ...pausas, column: 'b' }, 'lookup', ctx);
    assert.equal(outcome.ok, false);
  });

  it('não altera o grafo original', () => {
    const { graph, ctx } = setup();
    const before = JSON.stringify(graph);
    applyConnectOperation(graph, { ...agentes, column: 'Id' }, { ...pausas, column: 'Agente ID' }, 'lookup', ctx);
    assert.equal(JSON.stringify(graph), before);
  });
});

describe('pickGroupKey', () => {
  const types = (map: Record<string, 'id' | 'text' | 'number'>) => (c: string) =>
    map[c] ? { type: map[c], filled: 1, distinct: 1, uniqueRatio: 1, emptyRate: 0 } : undefined;

  it('prefere o mesmo nome, depois ID, depois texto', () => {
    const cols = ['Valor', 'Agente', 'Codigo'];
    assert.equal(pickGroupKey(cols, 'Valor', 'agente', types({ Valor: 'number', Agente: 'text', Codigo: 'id' })), 'Agente');
    assert.equal(pickGroupKey(cols, 'Valor', 'x', types({ Valor: 'number', Agente: 'text', Codigo: 'id' })), 'Codigo');
    assert.equal(pickGroupKey(['Valor', 'Nome'], 'Valor', 'x', types({ Nome: 'text' })), 'Nome');
    assert.equal(pickGroupKey(['Valor'], 'Valor', 'x', types({})), null);
  });
});
