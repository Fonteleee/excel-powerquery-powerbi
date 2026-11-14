// src/engine/recalc/incremental.test.ts
// Edição pela interface: o recálculo incremental (só o que mudou + dependentes, em todas as abas) precisa dar
// exatamente o mesmo resultado que recalcular a pasta de trabalho inteira.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Sheet } from '../../types/spreadsheet';
import { createRng } from '../__bench__/syntheticSheets';
import { buildSheet, cellAt, valueAt, withCell } from '../testing/sheets';
import { RecalcEngine } from './engine';
import { WorkbookRecalculator, declareEdit, diffCells } from './incremental';

/** Recálculo completo "do zero" da pasta de trabalho (referência). */
function fullRecalc(sheets: Sheet[]): Sheet[] {
  return new RecalcEngine(sheets).recalculateWorkbook(sheets).sheets;
}

function values(sheets: Sheet[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sheet of sheets) for (const [k, cell] of Object.entries(sheet.data)) out[`${sheet.id}!${k}`] = cell.value;
  return out;
}

function workbook(): Sheet[] {
  const dados = buildSheet('dados', 'Dados', [
    ['Produto', 'Qtd', 'Total'],
    ['A', 1, '=B2*10'],
    ['B', 2, '=B3*10'],
    ['C', 3, '=B4*10'],
    ['Soma', '=SOMA(B2:B4)', '=SOMA(C2:C4)'],
  ]);
  const resumo = buildSheet('resumo', 'Resumo', [
    ['=Dados!C5', '=Dados!B5+1'],
    ['=A1*2', '=SOMASES(Dados!B2:B4; Dados!A2:A4; "B")'],
    ['independente', 5],
  ]);
  const outra = buildSheet('outra', 'Outra', [[1, '=A1+1'], ['=B1+1', null]]);
  return fullRecalc([dados, resumo, outra]);
}

/** Simula o que a grade faz: edita uma célula numa cópia própria de `data` (sem recalcular). */
function edit(sheets: Sheet[], sheetId: string, address: string, raw: string): Sheet[] {
  return sheets.map(s => (s.id === sheetId ? withCell(s, address, raw) : s));
}

describe('recálculo incremental da pasta de trabalho', () => {
  it('editar uma entrada dá o mesmo resultado do recálculo completo, inclusive em outras abas', () => {
    const prev = workbook();
    const next = edit(prev, 'dados', 'B3', '50');
    const recalc = new WorkbookRecalculator();
    const { sheets, report } = recalc.update(prev, next);

    assert.equal(report.mode, 'incremental');
    assert.equal(report.changed, 1);
    assert.deepEqual(values(sheets), values(fullRecalc(edit(prev, 'dados', 'B3', '50'))));
    // dependências entre abas: Resumo!A1 = Dados!C5, Resumo!B2 = SOMASES(...)
    assert.equal(valueAt(sheets[1], 'A1'), 540);
    assert.equal(valueAt(sheets[1], 'B2'), 50);
    // só as fórmulas afetadas foram recalculadas (de 11 no total)
    assert.ok(report.recalculated < 11, `recalculou ${report.recalculated}`);
  });

  it('a aba que não depende da editada continua com a mesma referência', () => {
    const prev = workbook();
    const next = edit(prev, 'dados', 'B2', '7');
    const { sheets } = new WorkbookRecalculator().update(prev, next);
    assert.equal(sheets[2], prev[2]);
    assert.equal(sheets[2].data, prev[2].data);
  });

  it('o estado anterior (histórico para desfazer) não é alterado', () => {
    const prev = workbook();
    const before = values(prev);
    const next = edit(prev, 'dados', 'B2', '99');
    new WorkbookRecalculator().update(prev, next);
    assert.deepEqual(values(prev), before);
    assert.equal(valueAt(prev[0], 'C2'), 10);
  });

  it('apagar célula, trocar constante por fórmula e fórmula por constante batem com o completo', () => {
    const recalc = new WorkbookRecalculator();
    let state = workbook();
    const steps: [string, string, string][] = [
      ['dados', 'B4', ''],
      ['dados', 'B2', '=B3+100'],
      ['dados', 'C3', '12'],
      ['resumo', 'B3', '=Dados!B5*3'],
      ['outra', 'A1', '10'],
      ['dados', 'B4', '8'],
    ];
    for (const [sheetId, address, raw] of steps) {
      const next = edit(state, sheetId, address, raw);
      const expected = values(fullRecalc(edit(state, sheetId, address, raw)));
      const { sheets, report } = recalc.update(state, next);
      assert.equal(report.mode, 'incremental', `${sheetId}!${address}`);
      assert.deepEqual(values(sheets), expected, `${sheetId}!${address}=${raw}`);
      state = sheets;
    }
  });

  it('muitas edições aleatórias seguidas continuam iguais ao recálculo completo', () => {
    const rng = createRng(2024);
    const dados = buildSheet(
      'd',
      'Dados',
      Array.from({ length: 30 }, (_, r) => [
        r % 3,
        Math.floor(rng() * 100),
        r > 0 ? `=B${r + 1}+C${r}` : '=B1',
        `=SOMASES(B$1:B$30; A$1:A$30; A${r + 1})`,
      ])
    );
    const res = buildSheet('r', 'Res', [['=Dados!C30', '=SOMA(Dados!D1:D30)'], ['=A1+B1', null]]);
    let state = fullRecalc([dados, res]);
    const recalc = new WorkbookRecalculator();
    for (let i = 0; i < 40; i++) {
      const row = 1 + Math.floor(rng() * 30);
      const col = rng() < 0.5 ? 'A' : 'B';
      const raw = String(Math.floor(rng() * 5));
      const next = edit(state, 'd', `${col}${row}`, raw);
      const expected = values(fullRecalc(edit(state, 'd', `${col}${row}`, raw)));
      state = recalc.update(state, next).sheets;
      assert.deepEqual(values(state), expected, `edição ${i}: ${col}${row}=${raw}`);
    }
  });

  it('só formato mudou: nada é recalculado e a aba segue o novo estado', () => {
    const prev = workbook();
    const sheet = prev[0];
    const key = Object.keys(sheet.data)[1];
    const next = prev.map(s =>
      s.id === 'dados' ? { ...s, data: { ...s.data, [key]: { ...s.data[key], format: { bold: true } } } } : s
    );
    const recalc = new WorkbookRecalculator();
    const { sheets, report } = recalc.update(prev, next);
    assert.equal(report.mode, 'none');
    assert.equal(sheets[0].data[key].format?.bold, true);
  });

  it('sem mudança de dados (filtro, largura...) não recalcula nada', () => {
    const prev = workbook();
    const next = prev.map(s => (s.id === 'dados' ? { ...s, filterEnabled: true } : s));
    const { report } = new WorkbookRecalculator().update(prev, next);
    assert.equal(report.mode, 'none');
  });

  it('mudança estrutural (linhas) ou muitas células caem no recálculo completo, uma vez só', () => {
    const prev = workbook();
    const fewer = prev.map(s => (s.id === 'dados' ? { ...s, rowCount: s.rowCount - 1 } : s));
    assert.equal(new WorkbookRecalculator().update(prev, fewer).report.mode, 'full');

    const wide = edit(prev, 'dados', 'B2', '1');
    const many = wide.map(s =>
      s.id === 'dados'
        ? { ...s, data: { ...s.data, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`R10C${i}`, { raw: String(i), value: i }])) } }
        : s
    );
    const { sheets, report } = new WorkbookRecalculator().update(prev, many, { maxIncremental: 10 });
    assert.equal(report.mode, 'full');
    assert.deepEqual(values(sheets), values(fullRecalc(many)));
  });

  it('depois de importar/desfazer (estado desconhecido) o grafo é remontado e o resultado continua certo', () => {
    const recalc = new WorkbookRecalculator();
    const a = workbook();
    const b = edit(a, 'dados', 'B2', '3');
    const afterEdit = recalc.update(a, b).sheets;
    // "desfazer": o estado volta a ser `a` por fora do recalculador
    assert.equal(recalc.isSynced(a), false);
    const next = edit(a, 'dados', 'B3', '9');
    const { sheets, report } = recalc.update(a, next);
    assert.equal(report.mode, 'incremental');
    assert.deepEqual(values(sheets), values(fullRecalc(edit(a, 'dados', 'B3', '9'))));
    assert.ok(afterEdit.length === 3);
  });

  it('fórmula importada do Excel que o motor não calcula mantém o resultado do arquivo', () => {
    const base = buildSheet('x', 'X', [[1, '=FUNCAOINEXISTENTE(A1)', '=A1+1']]);
    base.data['R0C1'] = { ...base.data['R0C1'], excelValue: 99 };
    const prev = fullRecalc([base]);
    assert.equal(valueAt(prev[0], 'B1'), 99);
    const next = edit(prev, 'x', 'A1', '5');
    const { sheets, report } = new WorkbookRecalculator().update(prev, next);
    assert.equal(report.mode, 'incremental');
    assert.equal(valueAt(sheets[0], 'B1'), 99);
    assert.equal(cellAt(sheets[0], 'B1')?.excelValue, 99);
    assert.equal(valueAt(sheets[0], 'C1'), 6);
  });
});

describe('edição declarada pela grade', () => {
  it('com as chaves declaradas dá o mesmo resultado que a comparação completa', () => {
    const prev = workbook();
    const next = edit(prev, 'dados', 'B3', '50');
    declareEdit(prev[0].data, next[0].data, ['R2C1']);
    const { sheets, report } = new WorkbookRecalculator().update(prev, next);
    assert.equal(report.mode, 'incremental');
    assert.equal(report.changed, 1);
    assert.deepEqual(values(sheets), values(fullRecalc(edit(prev, 'dados', 'B3', '50'))));
  });

  it('declaração feita sobre outro estado base é ignorada (volta à comparação completa)', () => {
    const prev = workbook();
    const other = workbook();
    const next = edit(prev, 'dados', 'B3', '50');
    declareEdit(other[0].data, next[0].data, []); // base errada: não pode esconder a edição
    const { sheets, report } = new WorkbookRecalculator().update(prev, next);
    assert.equal(report.changed, 1);
    assert.equal(valueAt(sheets[0], 'C3'), 500);
  });
});

describe('diffCells', () => {
  it('conta só mudança de conteúdo e passa o limite como null', () => {
    const prev = { R0C0: { raw: '1', value: 1 }, R0C1: { raw: '2', value: 2 } };
    const next = {
      R0C0: { raw: '1', value: 1, format: { bold: true } },
      R0C1: { raw: '3', value: 3 },
      R1C0: { raw: 'x', value: 'x' },
    };
    assert.deepEqual(diffCells(prev, next, 10), [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
    assert.equal(diffCells(prev, next, 1), null);
    assert.deepEqual(diffCells(prev, { R0C0: prev.R0C0 }, 10), [{ row: 0, col: 1 }]);
  });
});
