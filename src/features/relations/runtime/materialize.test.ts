// src/features/relations/runtime/materialize.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FlowGraph, FlowNode, TransformParams } from '../model/graph';
import { edge, graphOf, makeSheet, sampleSheets, table } from '../testing/fixtures';
import { FLOW_SHEET_PREFIX, flowSheetId, materializeGraph } from './materialize';

const lookupParams: TransformParams = {
  op: 'lookup',
  sourceKey: 'Id',
  lookupKey: 'Agente ID',
  returns: ['Minutos'],
  ifNotFound: '-',
};

const transform = (id: string, params: TransformParams): FlowNode => ({ id, kind: 'transform', x: 0, y: 0, params });
const output = (id: string, sheetName: string): FlowNode => ({ id, kind: 'output', x: 0, y: 0, sheetName });

const graph = (sheetName = 'Resultado', params: TransformParams = lookupParams): FlowGraph =>
  graphOf(
    [table('ta', 'agentes'), table('tp', 'pausas'), transform('lk', params), output('out', sheetName)],
    [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
  );

describe('materializeGraph', () => {
  it('cria uma aba por nó de saída com id determinístico', () => {
    const base = sampleSheets();
    const result = materializeGraph(graph(), base);
    assert.equal(result.sheets.length, base.length + 1);
    assert.deepEqual(result.written, [flowSheetId('out')]);

    const sheet = result.sheets.find(s => s.id === flowSheetId('out'))!;
    assert.equal(sheet.name, 'Resultado');
    assert.equal(sheet.data['R0C0'].value, 'Id');
    assert.equal(sheet.data['R1C1'].value, 'Ana');
  });

  it('é idempotente: rodar de novo não duplica nem muda o resultado', () => {
    const first = materializeGraph(graph(), sampleSheets());
    const second = materializeGraph(graph(), first.sheets);
    assert.equal(second.sheets.length, first.sheets.length);
    assert.deepEqual(
      second.sheets.find(s => s.id === flowSheetId('out'))!.data,
      first.sheets.find(s => s.id === flowSheetId('out'))!.data
    );
    assert.deepEqual(second.removed, []);
  });

  it('não altera as planilhas do usuário', () => {
    const base = sampleSheets();
    const snapshot = JSON.stringify(base);
    materializeGraph(graph(), base);
    assert.equal(JSON.stringify(base), snapshot);
  });

  it('remove a aba quando o nó de saída deixa de existir', () => {
    const first = materializeGraph(graph(), sampleSheets());
    const withoutOutput = graphOf(
      [table('ta', 'agentes')],
      []
    );
    const second = materializeGraph(withoutOutput, first.sheets);
    assert.deepEqual(second.removed, [flowSheetId('out')]);
    assert.equal(second.sheets.some(s => s.id.startsWith(FLOW_SHEET_PREFIX)), false);
  });

  it('atualiza o conteúdo no mesmo lugar quando o nó muda', () => {
    const first = materializeGraph(graph(), sampleSheets());
    const changed = graph('Resultado', { ...lookupParams, ifNotFound: 'N/D' } as TransformParams);
    const second = materializeGraph(changed, first.sheets);
    const sheet = second.sheets.find(s => s.id === flowSheetId('out'))!;
    assert.equal(sheet.data['R3C3'].value, 'N/D'); // Carla (linha 3) não tem pausas; coluna 3 = Minutos
    assert.equal(second.sheets.length, first.sheets.length);
  });

  it('evita colidir com o nome de uma planilha do usuário', () => {
    const base = [...sampleSheets(), makeSheet('minha', 'Resultado', ['X'], [[1]])];
    const result = materializeGraph(graph('Resultado'), base);
    const created = result.sheets.find(s => s.id === flowSheetId('out'))!;
    assert.equal(created.name, 'Resultado (2)');
    assert.equal(result.sheets.find(s => s.id === 'minha')!.name, 'Resultado');
  });

  it('mantém a aba anterior e informa o erro quando o nó falha', () => {
    const first = materializeGraph(graph(), sampleSheets());
    const before = first.sheets.find(s => s.id === flowSheetId('out'))!;

    const broken = graph('Resultado', { ...lookupParams, returns: ['Nao Existe'] } as TransformParams);
    const second = materializeGraph(broken, first.sheets);

    assert.match(second.errors['out'], /"Nao Existe"/);
    assert.deepEqual(second.written, []);
    assert.deepEqual(second.removed, []);
    assert.equal(second.sheets.find(s => s.id === flowSheetId('out')), before);
  });
});
