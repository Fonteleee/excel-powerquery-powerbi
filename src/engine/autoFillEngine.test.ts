// src/engine/autoFillEngine.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSmartSeries } from './autoFillEngine';

const s = (src: (string | number)[], n: number) => computeSmartSeries(src, n);

describe('computeSmartSeries', () => {
  it('progressão numérica: passo único, constante e decimal', () => {
    assert.deepEqual(s(['1'], 3), [2, 3, 4]);
    assert.deepEqual(s(['2', '4'], 3), [6, 8, 10]);
    assert.deepEqual(s(['10', '7'], 2), [4, 1]);
    assert.deepEqual(s(['0,5', '1'], 2), [1.5, 2]);
    assert.deepEqual(s(['0.1', '0.2'], 2), [0.3, 0.4]);
  });

  it('datas BR: dia, passo de dias e meses (com fim de mês)', () => {
    assert.deepEqual(s(['29/08/2026'], 3), ['30/08/2026', '31/08/2026', '01/09/2026']);
    assert.deepEqual(s(['01/01/2026', '08/01/2026'], 2), ['15/01/2026', '22/01/2026']);
    assert.deepEqual(s(['31/01/2026', '28/02/2026'], 1), ['28/03/2026']);
    assert.deepEqual(s(['15/01/2026', '15/02/2026'], 2), ['15/03/2026', '15/04/2026']);
    assert.deepEqual(s(['1/1/26'], 2), ['2/1/26', '3/1/26']);
  });

  it('datas ISO mantêm o formato e não sofrem com fuso', () => {
    assert.deepEqual(s(['2026-08-29'], 2), ['2026-08-30', '2026-08-31']);
    assert.deepEqual(s(['2026-12-31'], 1), ['2027-01-01']);
  });

  it('dias da semana pt-BR, com ciclo, caixa e variantes', () => {
    assert.deepEqual(s(['Segunda'], 3), ['Terça', 'Quarta', 'Quinta']);
    assert.deepEqual(s(['sábado'], 2), ['domingo', 'segunda']);
    assert.deepEqual(s(['SEG'], 2), ['TER', 'QUA']);
    assert.deepEqual(s(['sexta-feira'], 2), ['sábado', 'domingo']);
    assert.deepEqual(s(['Terca'], 1), ['Quarta']);
    assert.deepEqual(s(['Seg', 'Qua'], 3), ['Sex', 'Dom', 'Ter']);
  });

  it('meses pt-BR, com virada de ano', () => {
    assert.deepEqual(s(['Janeiro'], 2), ['Fevereiro', 'Março']);
    assert.deepEqual(s(['novembro'], 3), ['dezembro', 'janeiro', 'fevereiro']);
    assert.deepEqual(s(['Out'], 3), ['Nov', 'Dez', 'Jan']);
    assert.deepEqual(s(['Mar'], 1), ['Abr']);
  });

  it('códigos e texto+número', () => {
    assert.deepEqual(s(['ID-001'], 3), ['ID-002', 'ID-003', 'ID-004']);
    assert.deepEqual(s(['ID-099'], 2), ['ID-100', 'ID-101']);
    assert.deepEqual(s(['Item 1', 'Item 3'], 2), ['Item 5', 'Item 7']);
    assert.deepEqual(s(['CMAC8040'], 1), ['CMAC8041']);
    assert.deepEqual(s(['1º'], 2), ['2º', '3º']);
    assert.deepEqual(s(['Lote 9A'], 1), ['Lote 10A']);
  });

  it('o que não é série repete (e prefixos diferentes também)', () => {
    assert.deepEqual(s(['abc'], 3), ['abc', 'abc', 'abc']);
    assert.deepEqual(s(['A1', 'B2'], 3), ['A1', 'B2', 'A1']);
    assert.deepEqual(s(['x', ''], 3), ['x', '', 'x']);
  });

  it('modo copiar repete a origem', () => {
    assert.deepEqual(computeSmartSeries(['1', '2'], 3, 'copy'), ['1', '2', '1']);
    assert.deepEqual(computeSmartSeries([], 3), []);
    assert.deepEqual(computeSmartSeries(['1'], 0), []);
  });
});
