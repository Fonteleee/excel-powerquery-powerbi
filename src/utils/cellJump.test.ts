// src/utils/cellJump.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseJumpTarget } from './cellJump';

const R = 1000;
const C = 200;

describe('parseJumpTarget', () => {
  it('célula simples e minúsculas', () => {
    const r = parseJumpTarget('b2', R, C);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.target.cell, { row: 1, col: 1 });
  });
  it('coluna de 3 letras (XEP50)', () => {
    const r = parseJumpTarget('XEP50', 100, 20000);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.target.cell, { row: 49, col: 16369 });
  });
  it('intervalo A1:C10 e invertido', () => {
    const r = parseJumpTarget('C10:A1', R, C);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.target.range, { startRow: 0, startCol: 0, endRow: 9, endCol: 2 });
  });
  it('coluna inteira B:B e linhas 3:3', () => {
    const col = parseJumpTarget('B:B', R, C);
    assert.ok(col.ok);
    if (col.ok) assert.deepEqual(col.target.range, { startRow: 0, startCol: 1, endRow: R - 1, endCol: 1 });
    const row = parseJumpTarget('3:3', R, C);
    assert.ok(row.ok);
    if (row.ok) assert.deepEqual(row.target.range, { startRow: 2, startCol: 0, endRow: 2, endCol: C - 1 });
  });
  it('recusa lixo, vazio e fora da tabela', () => {
    for (const bad of ['', 'abc', '3B', 'A1:', '$$', '0', 'A0', 'A1:B2:C3', '__proto__']) {
      assert.equal(parseJumpTarget(bad, R, C).ok, false, bad);
    }
    assert.equal(parseJumpTarget('A5000', R, C).ok, false);
    assert.equal(parseJumpTarget('ZZZ1', R, C).ok, false);
  });
});
