// src/features/relations/ui/cardData.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSheetFromDataset } from '../../../engine/pipelineEngine';
import { makeSheet, sampleSheets } from '../testing/fixtures';
import { evaluateGraph } from '../runtime/evaluate';
import { graphOf, table } from '../testing/fixtures';
import { buildCardColumns, flowBounds, outputStatus } from './cardData';

describe('buildCardColumns', () => {
  it('traz tipo inferido pelos valores e amostra dos primeiros valores preenchidos', () => {
    const result = evaluateGraph(graphOf([table('t', 'pausas')], []), sampleSheets()).get('t')!;
    const cols = buildCardColumns(result.table);
    assert.deepEqual(cols.map(c => c.name), ['Agente ID', 'Motivo', 'Minutos']);
    assert.equal(cols[0].info?.type, 'id');
    assert.equal(cols[2].info?.type, 'number');
    assert.deepEqual(cols[2].samples, ['60', '10', '45']);
  });

  it('sem tabela devolve lista vazia', () => {
    assert.deepEqual(buildCardColumns(null), []);
  });

  it('o tipo vem dos valores, não do nome: "Total" com texto não é número', () => {
    const sheet = makeSheet('s', 'S', ['Total', 'Valor'], [['alfa', 10], ['beta', 20], ['gama', 30]]);
    const cols = buildCardColumns(evaluateGraph(graphOf([table('t', 's')], []), [sheet]).get('t')!.table);
    assert.equal(cols[0].info?.type, 'text');
    assert.equal(cols[1].info?.type, 'number');
  });
});

describe('outputStatus', () => {
  const tableOf = (rows: Record<string, string | number>[]) => ({ headers: ['A', 'B'], rows });
  const rows = [{ A: 'x', B: 1 }, { A: 'y', B: 2 }];

  it('sem aba materializada: pendente', () => {
    assert.equal(outputStatus(undefined, tableOf(rows)), 'pending');
  });

  it('aba igual ao resultado: atualizada', () => {
    const sheet = createSheetFromDataset('flow-out-o', 'O', ['A', 'B'], rows);
    assert.equal(outputStatus(sheet, tableOf(rows)), 'fresh');
  });

  it('resultado mudou: desatualizada (valores, tamanho e cabeçalhos)', () => {
    const sheet = createSheetFromDataset('flow-out-o', 'O', ['A', 'B'], rows);
    assert.equal(outputStatus(sheet, tableOf([{ A: 'x', B: 1 }, { A: 'y', B: 99 }])), 'stale');
    assert.equal(outputStatus(sheet, tableOf(Array.from({ length: 40 }, (_, i) => ({ A: String(i), B: i })))), 'stale');
    assert.equal(outputStatus(sheet, { headers: ['A', 'C'], rows }), 'stale');
    assert.equal(outputStatus(sheet, null), 'stale');
  });
});

describe('flowBounds', () => {
  it('é null sem nós e envolve cada nó pelo tamanho do seu tipo', () => {
    assert.equal(flowBounds(graphOf([], [])), null);
    const g = graphOf(
      [table('a', 's', 10, 20), { id: 'o', kind: 'output', x: 600, y: 0, sheetName: 'S' }],
      []
    );
    const b = flowBounds(g)!;
    assert.equal(b.minX, 10);
    assert.equal(b.minY, 0);
    assert.equal(b.maxX, 600 + 208);
    assert.equal(b.maxY, 20 + 340);
  });
});