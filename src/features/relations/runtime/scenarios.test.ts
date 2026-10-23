// src/features/relations/runtime/scenarios.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FlowGraph, FlowNode, TransformParams } from '../model/graph';
import { edge, graphOf, makeSheet, sampleSheets, table } from '../testing/fixtures';
import { evaluateGraph } from './evaluate';
import { compareScenarios, forkScenario, stepThrough } from './scenarios';

const transform = (id: string, params: TransformParams): FlowNode => ({ id, kind: 'transform', x: 0, y: 0, params });
const output = (id: string): FlowNode => ({ id, kind: 'output', x: 0, y: 0, sheetName: 'Saida' });

// Pausas somadas por agente (Id do agente) -> saída
const graph = (): FlowGraph =>
  graphOf(
    [
      table('tp', 'pausas'),
      transform('ag', { op: 'aggregate', groupBy: ['Agente ID'], aggregations: [{ column: 'Minutos', agg: 'SUM', outputName: 'Total' }] }),
      output('out'),
    ],
    [edge('e1', 'tp', 'ag'), edge('e2', 'ag', 'out')]
  );

describe('stepThrough', () => {
  it('um estado por nó, em ordem topológica, acumulando os concluídos', () => {
    const s = stepThrough(graph(), sampleSheets());
    assert.ok(s.ok);
    assert.deepEqual(s.order, ['tp', 'ag', 'out']);
    assert.deepEqual(s.steps.map(x => x.completed.length), [1, 2, 3]);
    assert.equal(s.steps[0].result.table!.rows.length, 4);
    assert.equal(s.steps[2].kind, 'output');
  });

  it('o resultado de cada passo é o do evaluateGraph', () => {
    const sheets = sampleSheets();
    const direct = evaluateGraph(graph(), sheets);
    const s = stepThrough(graph(), sheets);
    assert.ok(s.ok);
    for (const step of s.steps) assert.deepEqual(step.result, direct.get(step.nodeId));
  });

  it('ciclo devolve ok:false', () => {
    const g = graphOf([table('a', 'pausas'), output('b')], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
    assert.equal(stepThrough(g, sampleSheets()).ok, false);
  });
});

describe('forkScenario', () => {
  it('multiplicar uma coluna não muta as planilhas originais e compartilha as não alteradas', () => {
    const sheets = sampleSheets();
    const snapshot = JSON.stringify(sheets);
    const fork = forkScenario(graph(), sheets, [{ kind: 'scaleColumn', sheetId: 'pausas', column: 'Minutos', factor: 1.15 }]);
    assert.equal(JSON.stringify(sheets), snapshot);
    assert.equal(fork.sheets[0], sheets[0], 'aba sem sobreposição mantém a referência');
    assert.notEqual(fork.sheets[1], sheets[1]);
    assert.equal(fork.sheets[1].data.R1C0, sheets[1].data.R1C0, 'células inalteradas são compartilhadas');
    const total = fork.results.get('out')!.table!.rows.find(r => String(r['Agente ID']).toLowerCase() === 'a02')!;
    assert.equal(total['Total'], 63.25);
  });

  it('filtrar linhas reduz a aba do cenário', () => {
    const sheets = sampleSheets();
    const fork = forkScenario(graph(), sheets, [{ kind: 'filterRows', sheetId: 'pausas', column: 'Motivo', operator: '=', value: 'Almoço' }]);
    assert.equal(fork.results.get('tp')!.table!.rows.length, 2);
    assert.equal(sheets[1].rowCount > fork.sheets[1].rowCount - 1, true);
    assert.equal(evaluateGraph(graph(), sheets).get('tp')!.table!.rows.length, 4);
  });

  it('trocar parâmetros de nó cria novo grafo sem tocar o original', () => {
    const g = graph();
    const fork = forkScenario(g, sampleSheets(), [
      { kind: 'nodeParams', nodeId: 'ag', params: { op: 'aggregate', groupBy: ['Agente ID'], aggregations: [{ column: 'Minutos', agg: 'MAX', outputName: 'Total' }] } },
    ]);
    assert.notEqual(fork.graph, g);
    assert.equal((g.nodes[1] as { params: { aggregations: { agg: string }[] } }).params.aggregations[0].agg, 'SUM');
    assert.equal(fork.results.get('out')!.table!.rows.find(r => String(r['Agente ID']) === 'A02')!['Total'], 45);
  });

  it('coluna inexistente não altera nada', () => {
    const sheets = sampleSheets();
    const fork = forkScenario(graph(), sheets, [{ kind: 'scaleColumn', sheetId: 'pausas', column: 'Nada', factor: 2 }]);
    assert.equal(fork.sheets[1], sheets[1]);
  });
});

describe('compareScenarios', () => {
  it('agregados e deltas por linha entre base e cenário', () => {
    const sheets = sampleSheets();
    const base = forkScenario(graph(), sheets, []);
    const alt = forkScenario(graph(), sheets, [{ kind: 'scaleColumn', sheetId: 'pausas', column: 'Minutos', factor: 2 }]);
    const cmp = compareScenarios(base, alt);
    assert.equal(cmp.outputs.length, 1);
    const out = cmp.outputs[0];
    const total = out.columns.find(c => c.column === 'Total')!;
    assert.equal(total.sumA, 145);
    assert.equal(total.sumB, 290);
    assert.equal(total.delta, 145);
    assert.equal(total.percent, 100);
    assert.equal(out.rowsA, out.rowsB);
    assert.ok(out.rows.length > 0 && out.rows.every(r => r.changes.Total.delta! > 0));
  });

  it('cenários idênticos não têm diferenças; erro de um lado aparece', () => {
    const sheets = sampleSheets();
    const a = forkScenario(graph(), sheets, []);
    assert.deepEqual(compareScenarios(a, a).outputs[0].rows, []);
    const broken = forkScenario(graph(), [makeSheet('pausas', 'Pausas', ['X'], [[1]])], []);
    const out = compareScenarios(a, broken).outputs[0];
    assert.equal(out.errorA, null);
    assert.notEqual(out.errorB, null);
  });
});
