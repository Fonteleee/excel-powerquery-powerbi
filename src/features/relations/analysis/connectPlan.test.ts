// src/features/relations/analysis/connectPlan.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addOutputNode, addTableNode, addTransformNode, defaultParams } from '../model/editor';
import { createEmptyGraph, FlowGraph } from '../model/graph';
import { parseFlowGraph } from '../model/schema';
import { evaluateGraph } from '../runtime/evaluate';
import { sampleSheets } from '../testing/fixtures';
import { createConnectContext } from './connectContext';
import { applyConnectOperation, connectColumnToPort, pickGroupKey } from './connectPlan';
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

describe('connectColumnToPort', () => {
  function withNode(op: 'lookup' | 'aggregate' | 'filter') {
    const { graph, ctx } = setup();
    const added = addTransformNode(graph, defaultParams(op), { x: 500, y: 0 });
    assert.ok(added.ok);
    return { graph: added.graph, id: added.id, ctx };
  }
  const paramsOf = (g: FlowGraph, id: string) => {
    const n = g.nodes.find(x => x.id === id);
    assert.ok(n && n.kind === 'transform');
    return n.params;
  };

  it('lookup: campo na porta de entrada vira a chave de origem', () => {
    const { graph, id, ctx } = withNode('lookup');
    const r = connectColumnToPort(graph, { nodeId: 'tbl-1', column: 'Id' }, id, 'in', ctx);
    assert.ok(r.ok);
    const p = paramsOf(r.graph, id);
    assert.ok(p.op === 'lookup');
    assert.equal(p.sourceKey, 'Id');
  });

  it('lookup: campo na porta de busca vira a coluna de busca e escolhe uma coluna de retorno', () => {
    const { graph, id, ctx } = withNode('lookup');
    const r = connectColumnToPort(graph, { nodeId: 'tbl-2', column: 'Agente ID' }, id, 'lookup', ctx);
    assert.ok(r.ok);
    const p = paramsOf(r.graph, id);
    assert.ok(p.op === 'lookup');
    assert.equal(p.lookupKey, 'Agente ID');
    assert.deepEqual(p.returns, ['Motivo']);
  });

  it('lookup: preserva as colunas de retorno já escolhidas', () => {
    const { graph, id, ctx } = withNode('lookup');
    const first = connectColumnToPort(graph, { nodeId: 'tbl-2', column: 'Agente ID' }, id, 'lookup', ctx);
    assert.ok(first.ok);
    const set = {
      ...first.graph,
      nodes: first.graph.nodes.map(n =>
        n.id === id && n.kind === 'transform' && n.params.op === 'lookup'
          ? { ...n, params: { ...n.params, returns: ['Minutos'] } }
          : n
      ),
    };
    const again = connectColumnToPort(set, { nodeId: 'tbl-2', column: 'Agente ID' }, id, 'lookup', ctx);
    assert.ok(again.ok);
    const p = paramsOf(again.graph, id);
    assert.ok(p.op === 'lookup');
    assert.deepEqual(p.returns, ['Minutos']);
  });

  it('aggregate: campo numérico vira soma; campo de texto vira agrupamento', () => {
    const a = withNode('aggregate');
    const num = connectColumnToPort(a.graph, { nodeId: 'tbl-2', column: 'Minutos' }, a.id, 'in', a.ctx);
    assert.ok(num.ok);
    const pn = paramsOf(num.graph, a.id);
    assert.ok(pn.op === 'aggregate');
    assert.deepEqual(pn.aggregations, [{ column: 'Minutos', agg: 'SUM', outputName: 'SUM_Minutos' }]);

    const txt = connectColumnToPort(a.graph, { nodeId: 'tbl-2', column: 'Motivo' }, a.id, 'in', a.ctx);
    assert.ok(txt.ok);
    const pt = paramsOf(txt.graph, a.id);
    assert.ok(pt.op === 'aggregate');
    assert.deepEqual(pt.groupBy, ['Motivo']);
  });

  it('filter: o campo vira a primeira condição, sem esvaziar o resultado', () => {
    const f = withNode('filter');
    const r = connectColumnToPort(f.graph, { nodeId: 'tbl-2', column: 'Minutos' }, f.id, 'in', f.ctx);
    assert.ok(r.ok);
    const p = paramsOf(r.graph, f.id);
    assert.ok(p.op === 'filter');
    assert.deepEqual(p.conditions, [{ column: 'Minutos', operator: '>=', value: '10' }]);
  });

  it('ligação à tabela inteira (sem campo) não altera parâmetros', () => {
    const { graph, id, ctx } = withNode('lookup');
    const r = connectColumnToPort(graph, { nodeId: 'tbl-1' }, id, 'in', ctx);
    assert.ok(r.ok);
    const p = paramsOf(r.graph, id);
    assert.ok(p.op === 'lookup');
    assert.equal(p.sourceKey, '');
  });

  it('propaga o erro de ligações inválidas', () => {
    const { graph, ctx } = setup();
    const out = addOutputNode(graph, 'S', { x: 600, y: 0 });
    assert.ok(out.ok);
    const r = connectColumnToPort(out.graph, { nodeId: 'tbl-1', column: 'Id' }, out.id, 'lookup', ctx);
    assert.equal(r.ok, false);
  });
});