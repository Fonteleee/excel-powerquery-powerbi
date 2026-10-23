// src/features/relations/analysis/ghostLinks.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Sheet } from '../../../types/spreadsheet';
import { makeSheet } from '../testing/fixtures';
import { suggestGhostLinks } from './ghostLinks';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** makeSheet só aceita texto/número/nulo: preenche a coluna com booleanos de verdade. */
function booleans(sheet: Sheet, col: number): Sheet {
  const data = { ...sheet.data };
  for (let r = 1; r < sheet.rowCount; r++) {
    const flag = r % 2 === 0;
    data[`R${r}C${col}`] = { raw: String(flag), value: flag };
  }
  return { ...sheet, data };
}

/** O motor reconverte texto numérico ao criar a planilha; aqui forçamos o valor como texto. */
function asText(sheet: Sheet): Sheet {
  const data = { ...sheet.data };
  for (const [key, cell] of Object.entries(data)) {
    if (!key.startsWith('R0C') && cell.value !== null) data[key] = { ...cell, raw: String(cell.value), value: String(cell.value) };
  }
  return { ...sheet, data };
}

const world =   (): Sheet[] => [
  makeSheet('clientes', 'Clientes', ['Id', 'Nome', 'Cidade'], range(50).map(i => [i, `Cliente ${i}`, i % 2 ? 'Rio' : 'SP'])),
  makeSheet(
    'pedidos',
    'Pedidos',
    ['Pedido', 'ClienteId', 'Valor', 'Status'],
    range(120).map(i => [1000 + i, ((i * 7) % 50) + 1, 10 + i * 1.5, i % 3 ? 'Aberto' : 'Fechado'])
  ),
  makeSheet(
    'produtos',
    'Produtos',
    ['Sku', 'Descrição', 'Status'],
    range(40).map(i => [`SKU-${i}`, `Produto ${i}`, i % 2 ? 'Aberto' : 'Fechado'])
  ),
  booleans(makeSheet('log', 'Log', ['Data', 'Ativo'], range(30).map(i => [`2023-01-${String((i % 28) + 1).padStart(2, '0')}`, null])), 1),
  makeSheet('vip', 'Vip', ['ClienteId'], range(10).map(i => [i])),
];

describe('suggestGhostLinks', () => {
  it('sugere a chave estrangeira certa em primeiro lugar, com razão em português', () => {
    const r = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' });
    assert.ok(r.suggestions.length > 0);
    const top = r.suggestions[0];
    assert.equal(top.sheetId, 'clientes');
    assert.equal(top.column, 'Id');
    assert.ok(top.score > 0.7, `score ${top.score}`);
    assert.equal(top.metrics.containment, 1);
    assert.equal(top.metrics.candidateUniqueness, 1);
    assert.match(top.reason, /100% dos valores de "ClienteId" existem em "Id" \(Clientes\)/);
    assert.match(top.reason, /valores únicos/);
  });

  it('não sugere colunas sem relação, de outro tipo, booleanas ou da mesma tabela', () => {
    const r = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0 });
    const keys = r.suggestions.map(s => `${s.sheetId}.${s.column}`);
    assert.ok(!keys.includes('produtos.Sku'));
    assert.ok(!keys.includes('log.Ativo'));
    assert.ok(!keys.includes('log.Data'));
    assert.ok(!keys.some(k => k.startsWith('pedidos.')));
  });

  it('colunas de baixa cardinalidade (Status) têm pontuação baixa', () => {
    const r = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'Status' }, { minScore: 0 });
    const status = r.suggestions.find(s => s.sheetId === 'produtos' && s.column === 'Status');
    assert.ok(status);
    assert.ok(status.score < 0.5, `score ${status.score}`);
    const defaults = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'Status' });
    assert.equal(defaults.suggestions.find(s => s.column === 'Status'), undefined);
  });

  it('número x texto casa pelo texto e é marcado como tipo diferente', () => {
    const sheets = world();
    sheets[0] = asText(makeSheet('clientes', 'Clientes', ['Código'], range(50).map(i => [String(i)])));
    const r = suggestGhostLinks(sheets, { sheetId: 'pedidos', column: 'ClienteId' });
    const top = r.suggestions.find(s => s.sheetId === 'clientes')!;
    assert.ok(top);
    assert.equal(top.column, 'Código');
    assert.equal(top.metrics.typeMismatch, true);
    assert.match(top.reason, /tipos diferentes/);
  });

  it('datas só combinam com datas', () => {
    const sheets = [
      makeSheet('a', 'A', ['Quando'], range(20).map(i => [`2023-02-${String(i).padStart(2, '0')}`])),
      makeSheet('b', 'B', ['Dia'], range(20).map(i => [`2023-02-${String(i).padStart(2, '0')}`])),
      makeSheet('c', 'C', ['Texto'], range(20).map(i => [`2023-02-${String(i).padStart(2, '0')}x`])),
    ];
    const r = suggestGhostLinks(sheets, { sheetId: 'a', column: 'Quando' });
    assert.deepEqual(r.suggestions.map(s => s.sheetId), ['b']);
  });

  it('é determinístico e independe da ordem das planilhas', () => {
    const a = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0 });
    const b = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0 });
    assert.deepEqual(a, b);
    const reversed = suggestGhostLinks([...world()].reverse(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0 });
    assert.deepEqual(reversed.suggestions, a.suggestions);
  });

  it('respeita maxResults, exclude e coluna por índice', () => {
    const all = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0 });
    assert.ok(all.suggestions.length >= 2);
    assert.equal(suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { minScore: 0, maxResults: 1 }).suggestions.length, 1);
    const excluded = suggestGhostLinks(
      world(),
      { sheetId: 'pedidos', column: 'ClienteId' },
      { exclude: [{ sheetId: 'clientes', column: 'Id' }] }
    );
    assert.ok(!excluded.suggestions.some(s => s.sheetId === 'clientes' && s.column === 'Id'));
    const byIndex = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 1 });
    assert.equal(byIndex.suggestions[0].column, 'Id');
  });

  it('limita o custo: orçamento de células e linhas por coluna', () => {
    const limited = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { maxCells: 1, minScore: 0 });
    assert.equal(limited.truncated, true);
    assert.ok(limited.scannedCells < 200);

    const full = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' });
    assert.equal(full.truncated, false);

    const fewRows = suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'ClienteId' }, { maxRowsPerColumn: 5 });
    assert.ok(fewRows.scannedCells < full.scannedCells);
  });

  it('com muitos valores, a amostra de 1000 ainda acha a chave', () => {
    const big = range(5000);
    const sheets = [
      makeSheet('fatos', 'Fatos', ['K'], big.map(i => [i])),
      makeSheet('dim', 'Dim', ['Chave', 'Nome'], big.map(i => [i, `n${i}`])),
    ];
    const r = suggestGhostLinks(sheets, { sheetId: 'fatos', column: 'K' });
    assert.equal(r.suggestions[0].column, 'Chave');
    assert.equal(r.suggestions[0].metrics.containment, 1);
    assert.equal(r.suggestions[0].metrics.sourceDistinct, 5000);
  });

  it('entradas inexistentes devolvem lista vazia; planilha congelada não quebra', () => {
    assert.deepEqual(suggestGhostLinks(world(), { sheetId: 'nada', column: 'X' }).suggestions, []);
    assert.deepEqual(suggestGhostLinks(world(), { sheetId: 'pedidos', column: 'Nada' }).suggestions, []);
    assert.doesNotThrow(() => suggestGhostLinks(deepFreeze(world()), { sheetId: 'pedidos', column: 'ClienteId' }));
  });

  it('colunas constantes ou quase vazias não geram sugestões', () => {
    const sheets = [
      makeSheet('a', 'A', ['K'], range(20).map(() => ['x'])),
      makeSheet('b', 'B', ['K'], range(20).map(() => ['x'])),
    ];
    assert.deepEqual(suggestGhostLinks(sheets, { sheetId: 'a', column: 'K' }, { minScore: 0 }).suggestions, []);
  });
});
