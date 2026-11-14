// src/utils/projectFile.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Sheet } from '../types/spreadsheet';
import { appendableSheets, decodeProject, encodeProject, parseProject, ProjectData, serializeProject } from './projectFile';

function sheet(id: string, name: string, extra: Partial<Sheet> = {}): Sheet {
  return {
    id, name, rowCount: 10, colCount: 5, colWidths: {}, rowHeights: {}, mergedRegions: [], conditionalRules: [],
    data: { R0C0: { raw: 'oi', value: 'oi' } as never },
    ...extra,
  };
}

function project(sheets: Sheet[] = [sheet('a', 'Vendas')]): ProjectData {
  return { sheets, activeSheetId: sheets[0].id, starredSheetIds: [sheets[0].id], relationEdges: [], flowGraph: null, preferences: { zoomLevel: 110 } };
}

describe('projectFile', () => {
  it('ida e volta preserva abas, ocultos, congelados e níveis', () => {
    const s = sheet('a', 'Vendas', { hiddenRows: [2], hiddenCols: [1], frozenRows: 1, frozenCols: 2, rowLevels: { 3: 1 }, hidden: true });
    const r = parseProject(serializeProject(project([s]), new Date('2026-01-02T03:04:05Z')));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.project.formato, 'verxel-projeto');
    assert.equal(r.project.criadoEm, '2026-01-02T03:04:05.000Z');
    assert.deepEqual(r.project.sheets[0].hiddenRows, [2]);
    assert.equal(r.project.sheets[0].frozenCols, 2);
    assert.deepEqual(r.project.sheets[0].rowLevels, { 3: 1 });
    assert.equal(r.project.sheets[0].hidden, true);
    assert.deepEqual(r.project.preferences, { zoomLevel: 110 });
  });

  it('gzip ou puro: decodeProject lê os dois', async () => {
    const enc = await encodeProject(project());
    const a = await decodeProject(enc.bytes);
    assert.ok(a.ok);
    const plain = new TextEncoder().encode(serializeProject(project()));
    const b = await decodeProject(plain);
    assert.ok(b.ok);
  });

  it('rejeita outro formato, versão futura e JSON ruim', () => {
    assert.equal(parseProject('{"formato":"outro"}').ok, false);
    assert.equal(parseProject('nao json').ok, false);
    const futuro = JSON.parse(serializeProject(project()));
    futuro.versao = 99;
    assert.equal(parseProject(JSON.stringify(futuro)).ok, false);
  });

  it('bloqueia __proto__/constructor/prototype em qualquer profundidade', () => {
    const base = serializeProject(project());
    const evil = base.replace('"preferences":{', '"preferences":{"x":{"y":[{"__proto__":1}]},');
    assert.equal(parseProject(evil).ok, false);
    const evil2 = base.replace('"data":{', '"data":{"constructor":{},');
    assert.equal(parseProject(evil2).ok, false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it('valida estrutura das abas e ids repetidos', () => {
    const j = JSON.parse(serializeProject(project()));
    j.sheets[0].rowCount = -1;
    assert.equal(parseProject(JSON.stringify(j)).ok, false);
    const dup = JSON.parse(serializeProject(project([sheet('a', 'A'), sheet('b', 'B')])));
    dup.sheets[1].id = 'a';
    assert.equal(parseProject(JSON.stringify(dup)).ok, false);
  });

  it('descarta imagens externas e corrige aba ativa inexistente', () => {
    const j = JSON.parse(serializeProject(project([sheet('a', 'A', { images: [
      { id: '1', src: 'https://x.com/a.png', x: 0, y: 0, width: 1, height: 1 },
      { id: '2', src: 'data:image/png;base64,AAAA', x: 0, y: 0, width: 1, height: 1 },
    ] })])));
    j.activeSheetId = 'nao-existe';
    const r = parseProject(JSON.stringify(j));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.project.activeSheetId, 'a');
    assert.equal(r.project.sheets[0].images?.length, 1);
  });

  it('fluxo inválido não impede abrir as abas', () => {
    const j = JSON.parse(serializeProject(project()));
    j.flowGraph = { version: 1, nodes: 'ruim' };
    const r = parseProject(JSON.stringify(j));
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.project.flowGraph, null);
  });

  it('appendableSheets gera ids e nomes únicos', () => {
    let n = 0;
    const out = appendableSheets([sheet('a', 'Vendas')], [sheet('a', 'vendas'), sheet('z', 'Vendas')], () => `novo${++n}`);
    assert.equal(out[0].id, 'novo1');
    assert.equal(out[0].name, 'vendas (2)');
    assert.equal(out[1].id, 'z');
    assert.equal(out[1].name, 'Vendas (3)');
  });
});
