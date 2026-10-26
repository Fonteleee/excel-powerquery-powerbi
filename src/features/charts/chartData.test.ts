// src/features/charts/chartData.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeSheet } from '../relations/testing/fixtures';
import { chartFromSelection, chartModel, createChart, detectRegion } from './chartData';

const vendas = makeSheet('v', 'Vendas', ['Mês', 'Receita', 'Custo', 'Obs'], [
  ['Jan', 100, 60, 'ok'],
  ['Fev', 120, 70, ''],
  ['Mar', '150', 80, 'bom'],
  ['Abr', 90, 50, ''],
]);

describe('chartModel', () => {
  it('usa a primeira coluna como categorias e as colunas numéricas como séries', () => {
    const m = chartModel(vendas, { range: 'A1:D5', type: 'bar' });
    assert.equal(m.ok, true);
    assert.equal(m.xKey, 'Mês');
    assert.deepEqual(m.series.map(s => s.name), ['Receita', 'Custo']); // "Obs" é texto: fica de fora
    assert.equal(m.data.length, 4);
    assert.deepEqual(m.data[0], { Mês: 'Jan', s1: 100, s2: 60 });
    assert.equal(m.data[2].s1, 150, 'texto numérico vira número');
  });

  it('sem cabeçalho, nomeia as séries', () => {
    const m = chartModel(vendas, { range: 'A2:C5', type: 'line' });
    assert.equal(m.ok, true);
    assert.deepEqual(m.series.map(s => s.name), ['Série 1', 'Série 2']);
    assert.equal(m.data.length, 4);
  });

  it('explica por que não dá para montar o gráfico', () => {
    assert.match(chartModel(vendas, { range: 'B1:B5', type: 'bar' }).error!, /duas colunas/);
    assert.match(chartModel(vendas, { range: 'A1:A2', type: 'bar' }).error!, /duas colunas/);
    assert.match(chartModel(vendas, { range: 'D1:D4', type: 'bar' }).error!, /duas colunas/);
    assert.match(chartModel(vendas, { range: 'XX', type: 'bar' }).error!, /inválido/);
    assert.match(chartModel(makeSheet('t', 'T', ['a', 'b'], [['x', 'y']]), { range: 'A1:B2', type: 'bar' }).error!, /números/);
  });

  it('acompanha os dados: mudar a célula muda o gráfico', () => {
    const changed = { ...vendas, data: { ...vendas.data, R1C1: { raw: '999', value: 999 } } };
    assert.equal(chartModel(changed, { range: 'A1:B5', type: 'bar' }).data[0].s1, 999);
  });
});

describe('detectRegion e criação', () => {
  it('acha a região de dados ao redor da célula', () => {
    assert.deepEqual(detectRegion(vendas, 2, 1), { startRow: 0, startCol: 0, endRow: 4, endCol: 3 });
  });

  it('cria o gráfico pela seleção ou pela célula ativa', () => {
    const a = chartFromSelection(vendas, { startRow: 2, startCol: 1, endRow: 2, endCol: 1 }, { row: 2, col: 1 });
    assert.equal(a.ok, true);
    if (a.ok) assert.equal(a.chart.range, 'A1:D5');
    const b = chartFromSelection(vendas, { startRow: 0, startCol: 0, endRow: 4, endCol: 2 }, { row: 0, col: 0 }, 'pie');
    assert.equal(b.ok && b.chart.range === 'A1:C5' && b.chart.type === 'pie', true);
  });

  it('célula vazia sem dados ao redor pede uma seleção', () => {
    const empty = makeSheet('e', 'E', ['a'], []);
    const r = chartFromSelection(empty, { startRow: 20, startCol: 5, endRow: 20, endCol: 5 }, { row: 20, col: 5 });
    assert.equal(r.ok, false);
  });

  it('ids únicos e posições que não se sobrepõem', () => {
    const first = createChart(vendas, { range: 'A1:B5' });
    assert.ok(first.ok);
    const second = createChart(vendas, { range: 'A1:C5', title: 'Dois' }, first.ok ? [first.chart] : []);
    assert.ok(second.ok);
    if (first.ok && second.ok) {
      assert.notEqual(first.chart.id, second.chart.id);
      assert.notDeepEqual([first.chart.x, first.chart.y], [second.chart.x, second.chart.y]);
      assert.equal(second.chart.title, 'Dois');
    }
  });
});
