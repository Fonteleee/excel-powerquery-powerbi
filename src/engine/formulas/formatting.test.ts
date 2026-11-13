// src/engine/formulas/formatting.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countDataRows } from '../sheetColumns';
import { formatCellValue } from './formatting';

describe('exibição de números no formato Geral', () => {
  it('corta o ruído de ponto flutuante e usa vírgula', () => {
    assert.equal(formatCellValue(50 / 3), '16,666666667');
    assert.equal(formatCellValue(0.1 + 0.2), '0,3');
    assert.equal(formatCellValue(3.33), '3,33');
    assert.equal(formatCellValue(1234567), '1234567');
  });
});

describe('contagem de registros', () => {
  it('conta só linhas de dados com conteúdo (sem cabeçalho nem linhas vazias)', () => {
    assert.equal(countDataRows({ data: {} }), 0);
    const data = { R0C0: { raw: 'a', value: 'a' }, R1C0: { raw: '1', value: 1 }, R5C3: { raw: '2', value: 2 }, R7C0: { raw: '', value: '' } };
    assert.equal(countDataRows({ data }), 2);
  });
});
