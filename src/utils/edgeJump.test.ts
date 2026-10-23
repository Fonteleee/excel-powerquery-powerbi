// src/utils/edgeJump.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEdgeJump, jumpIndex } from './edgeJump';

// Coluna 0, linhas preenchidas: 2,3,4 e 7,8
const filled = new Set([2, 3, 4, 7, 8]);
const at = (i: number) => filled.has(i);

describe('jumpIndex (regra do Excel)', () => {
  it('dentro de um bloco vai ao fim do bloco', () => {
    assert.equal(jumpIndex(2, 1, 20, at), 4);
    assert.equal(jumpIndex(4, -1, 20, at), 2);
  });
  it('no fim do bloco salta para o próximo bloco', () => {
    assert.equal(jumpIndex(4, 1, 20, at), 7);
    assert.equal(jumpIndex(7, -1, 20, at), 4);
  });
  it('de célula vazia vai à próxima preenchida', () => {
    assert.equal(jumpIndex(0, 1, 20, at), 2);
    assert.equal(jumpIndex(5, 1, 20, at), 7);
  });
  it('sem mais dados vai à borda', () => {
    assert.equal(jumpIndex(8, 1, 20, at), 19);
    assert.equal(jumpIndex(2, -1, 20, at), 0);
    assert.equal(jumpIndex(19, 1, 20, at), 19);
    assert.equal(jumpIndex(0, -1, 20, at), 0);
  });
  it('bloco que termina na borda', () => {
    assert.equal(jumpIndex(5, 1, 7, i => i >= 5), 6);
  });
});

describe('computeEdgeJump', () => {
  const base = { rowCount: 20, colCount: 5, isFilled: (r: number, c: number) => c === 0 && filled.has(r) };

  it('Ctrl+seta colapsa a seleção na célula de destino', () => {
    const r = computeEdgeJump({ ...base, anchor: { row: 2, col: 0 }, focus: { row: 2, col: 0 }, direction: 'down', extend: false });
    assert.deepEqual(r.active, { row: 4, col: 0 });
    assert.deepEqual(r.range, { startRow: 4, endRow: 4, startCol: 0, endCol: 0 });
  });

  it('Ctrl+Shift+seta mantém a âncora e estende (sem misturar linha com coluna)', () => {
    const r = computeEdgeJump({ ...base, anchor: { row: 7, col: 0 }, focus: { row: 7, col: 0 }, direction: 'up', extend: true });
    assert.deepEqual(r.active, { row: 4, col: 0 });
    assert.deepEqual(r.range, { startRow: 4, endRow: 7, startCol: 0, endCol: 0 });
  });

  it('horizontal usa as colunas', () => {
    const r = computeEdgeJump({ ...base, anchor: { row: 3, col: 0 }, focus: { row: 3, col: 0 }, direction: 'right', extend: true });
    assert.deepEqual(r.active, { row: 3, col: 4 });
    assert.equal(r.range.endCol, 4);
    assert.equal(r.range.startRow, 3);
  });
});
