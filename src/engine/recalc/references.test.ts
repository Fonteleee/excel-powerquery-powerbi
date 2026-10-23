// src/engine/recalc/references.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSheet } from '../testing/sheets';
import { SheetNameIndex, WHOLE_COLUMN_END_ROW, extractReferences } from './references';

const a = buildSheet('a', 'Vendas', []);
const b = buildSheet('b', 'Acompanhamento de Pagamentos', []);
const c = buildSheet('c', 'Planilha 2', []);
const names = new SheetNameIndex([a, b, c]);
const refs = (formula: string, current = 'a') => extractReferences(formula, current, names);

describe('extractReferences', () => {
  it('encontra células simples, com e sem âncora', () => {
    const r = refs('=A1+$B$2*c3');
    assert.deepEqual(r.cells.map(x => [x.row, x.col]), [[0, 0], [1, 1], [2, 2]]);
    assert.equal(r.ranges.length, 0);
  });

  it('encontra intervalos e normaliza a orientação', () => {
    const r = refs('=SOMA(B5:A2)');
    assert.deepEqual(r.ranges, [{ sheetId: 'a', startRow: 1, startCol: 0, endRow: 4, endCol: 1 }]);
  });

  it('colunas inteiras valem para qualquer linha', () => {
    const r = refs('=PROCX(A2; Dados!A:A; $C:$D)');
    const whole = r.ranges.filter(x => x.endRow === WHOLE_COLUMN_END_ROW);
    assert.equal(whole.length, 2);
    assert.deepEqual(whole.map(x => [x.startCol, x.endCol]).sort(), [[0, 0], [2, 3]]);
  });

  it('resolve abas com aspas, nome abreviado e nome desconhecido', () => {
    const r = refs("=SOMA('Acompanhamento de Pagamentos'!C2:C4)+'Acompanhamento de Pa...'!D2+Naoexiste!A1");
    assert.deepEqual(r.ranges.map(x => x.sheetId), ['b']);
    assert.deepEqual(r.cells.map(x => x.sheetId), ['b', 'a']);
  });

  it('ignora o que está dentro de texto e nomes de função com número', () => {
    const r = refs('=SE(A1>1; "B2 e C3:D4"; LOG10(5))+ATAN2(1;1)');
    assert.deepEqual(r.cells.map(x => [x.row, x.col]), [[0, 0]]);
    assert.equal(r.ranges.length, 0);
  });

  it('não confunde notação científica nem horas com referência', () => {
    assert.equal(refs('=1E5+12:30').cells.length, 0);
  });

  it('detecta fórmulas voláteis', () => {
    assert.equal(refs('=HOJE()').volatile, true);
    assert.equal(refs('=SOMA(A1:A3)').volatile, false);
    assert.equal(refs('="HOJE("').volatile, false);
  });

  it('texto que não é fórmula não tem referências', () => {
    const r = refs('A1');
    assert.equal(r.cells.length + r.ranges.length, 0);
  });
});
