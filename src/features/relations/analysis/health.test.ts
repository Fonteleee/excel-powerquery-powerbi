// src/features/relations/analysis/health.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey } from '../../../engine/formulaParser';
import { Sheet } from '../../../types/spreadsheet';
import { makeSheet } from '../testing/fixtures';
import { formatDate, parseDateText } from './dates';
import { analyzeSheetHealth, applyHealthFix, previewHealthFix } from './health';

const messy = (): Sheet =>
  makeSheet(
    's1',
    'Sujo',
    ['Id', 'Nome', 'Valor', 'Data', 'Obs'],
    [
      ['A01', 'Ana ', 100, '05/01/2023', 'x'],
      ['A02', 'Bruno', '200', '2023-01-06', null],
      ['A03', 'Carla  Souza', 300, '07/01/2023', ''],
      ['A04', ' Diego', 'abc', '08/01/2023', 'y'],
      ['A01', 'Ana ', 100, '05/01/2023', 'x'],
      ['A05', 'Eva', 150.5, '09/01/2023', 'z'],
    ]
  );

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const nome = (sheet: Sheet, row: number): unknown => sheet.data[cellPosToKey(row, 1)]?.value;
const col = (sheet: Sheet, name: string) => analyzeSheetHealth(sheet).columns.find(c => c.header === name)!;

describe('analyzeSheetHealth', () => {
  it('mede consistência, completude e duplicatas', () => {
    const h = analyzeSheetHealth(messy());
    assert.equal(h.dataRows, 6);
    assert.equal(h.duplicateRows, 1);
    assert.deepEqual(h.duplicateRowSample, [4]);
    assert.equal(h.consistentRows, 1);
    assert.ok(Math.abs(h.consistencyPercent - (1 / 6) * 100) < 1e-9);
    // 30 células possíveis, 2 vazias em Obs (null e '')
    assert.ok(Math.abs(h.completenessPercent - (28 / 30) * 100) < 1e-9);
  });

  it('conta campos vazios e espaços sobrando por coluna', () => {
    const h = analyzeSheetHealth(messy());
    const obs = h.columns.find(c => c.header === 'Obs')!;
    assert.equal(obs.empty, 2);
    assert.ok(Math.abs(obs.emptyPercent - (2 / 6) * 100) < 1e-9);
    assert.equal(h.columns.find(c => c.header === 'Nome')!.whitespaceCells, 4);
    assert.equal(h.columns.find(c => c.header === 'Id')!.whitespaceCells, 0);
  });

  it('detecta tipos mistos e número guardado como texto', () => {
    const valor = col(messy(), 'Valor');
    assert.equal(valor.mixedTypes, true);
    assert.equal(valor.kinds.number, 4);
    assert.equal(valor.kinds.numericText, 1);
    assert.equal(valor.kinds.text, 1);
    assert.equal(valor.dominantKind, 'number');
    assert.equal(col(messy(), 'Id').mixedTypes, false);
  });

  it('detecta formatos de data divergentes', () => {
    const data = col(messy(), 'Data');
    assert.equal(data.divergentDates, true);
    assert.equal(data.dominantDateFormat, 'dd/mm/yyyy');
    assert.deepEqual(data.dateFormats, { 'dd/mm/yyyy': 5, 'yyyy-mm-dd': 1 });
  });

  it('propõe correções declarativas com contagens', () => {
    const fixes = analyzeSheetHealth(messy()).fixes;
    assert.deepEqual(
      fixes.map(f => f.id),
      ['trim_spaces', 'standardize_type:number:2', 'normalize_dates:3', 'remove_duplicates']
    );
    const byId = Object.fromEntries(fixes.map(f => [f.id, f]));
    assert.deepEqual(byId['trim_spaces'].fix, { kind: 'trim_spaces', columns: ['Nome'] });
    assert.equal(byId['trim_spaces'].affectedCells, 4);
    assert.deepEqual(byId['standardize_type:number:2'].fix, { kind: 'standardize_type', column: 'Valor', to: 'number' });
    assert.equal(byId['standardize_type:number:2'].affectedCells, 1);
    assert.deepEqual(byId['normalize_dates:3'].fix, { kind: 'normalize_dates', column: 'Data', to: 'dd/mm/yyyy' });
    assert.equal(byId['normalize_dates:3'].affectedCells, 1);
    assert.equal(byId['remove_duplicates'].affectedRows, 1);
    // As propostas são dados puros: sobrevivem a JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(fixes)), fixes);
  });

  it('planilha limpa não propõe nada e tem 100%', () => {
    const clean = makeSheet('c', 'Limpa', ['A', 'B'], [['x', 1], ['y', 2]]);
    const h = analyzeSheetHealth(clean);
    assert.equal(h.consistencyPercent, 100);
    assert.equal(h.completenessPercent, 100);
    assert.deepEqual(h.fixes, []);
  });

  it('planilha vazia não quebra', () => {
    const h = analyzeSheetHealth(makeSheet('e', 'Vazia', ['A'], []));
    assert.equal(h.dataRows, 0);
    assert.equal(h.consistencyPercent, 100);
  });

  it('é puro: roda sobre planilha congelada sem erro', () => {
    assert.doesNotThrow(() => analyzeSheetHealth(deepFreeze(messy())));
  });
});

describe('applyHealthFix', () => {
  it('aparar espaços: devolve nova planilha e preserva a original', () => {
    const original = deepFreeze(messy());
    const fixed = applyHealthFix(original, { kind: 'trim_spaces', columns: ['Nome'] });
    assert.notEqual(fixed, original);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(r => nome(fixed, r)), ['Ana', 'Bruno', 'Carla Souza', 'Diego', 'Ana', 'Eva']);
    assert.deepEqual([1, 2, 3, 4].map(r => nome(original, r)), ['Ana ', 'Bruno', 'Carla  Souza', ' Diego']);
    assert.equal(fixed.data[cellPosToKey(1, 1)].raw, 'Ana');
  });

  it('padronizar tipo para número converte só o que é número em texto', () => {
    const original = deepFreeze(messy());
    const preview = previewHealthFix(original, { kind: 'standardize_type', column: 'Valor', to: 'number' });
    assert.equal(preview.changedCells, 1);
    assert.strictEqual(preview.sheet.data[cellPosToKey(2, 2)].value, 200);
    assert.strictEqual(preview.sheet.data[cellPosToKey(4, 2)].value, 'abc');
    assert.strictEqual(original.data[cellPosToKey(2, 2)].value, '200');
  });

  it('padronizar tipo para texto converte números', () => {
    const sheet = makeSheet('t', 'T', ['Id'], [['A1'], [2], ['B3'], [4]]);
    const fixed = applyHealthFix(sheet, { kind: 'standardize_type', column: 'Id', to: 'text' });
    assert.deepEqual([1, 2, 3, 4].map(r => fixed.data[cellPosToKey(r, 0)].value), ['A1', '2', 'B3', '4']);
  });

  it('padronizar datas converte para o formato alvo e preserva as inválidas', () => {
    const sheet = makeSheet('d', 'D', ['Data'], [['05/01/2023'], ['2023-01-06'], ['31/02/2023'], ['07-01-2023'], ['10/01/23']]);
    const preview = previewHealthFix(sheet, { kind: 'normalize_dates', column: 'Data', to: 'dd/mm/yyyy' });
    assert.deepEqual(
      [1, 2, 3, 4, 5].map(r => preview.sheet.data[cellPosToKey(r, 0)].value),
      ['05/01/2023', '06/01/2023', '31/02/2023', '07/01/2023', '10/01/2023']
    );
    assert.equal(preview.changedCells, 3);
    const iso = applyHealthFix(sheet, { kind: 'normalize_dates', column: 'Data', to: 'yyyy-mm-dd' });
    assert.equal(iso.data[cellPosToKey(1, 0)].value, '2023-01-05');
  });

  it('remover duplicados exatos mantém a primeira e sobe as linhas seguintes', () => {
    const original = deepFreeze(messy());
    const preview = previewHealthFix(original, { kind: 'remove_duplicates' });
    assert.equal(preview.removedRows, 1);
    const fixed = preview.sheet;
    assert.equal(fixed.data[cellPosToKey(5, 0)].value, 'A05');
    assert.equal(fixed.data[cellPosToKey(6, 0)], undefined);
    assert.equal(analyzeSheetHealth(fixed).duplicateRows, 0);
    assert.equal(original.data[cellPosToKey(6, 0)].value, 'A05');
    assert.equal(original.data[cellPosToKey(5, 0)].value, 'A01');
  });

  it('aplicar todas as correções propostas melhora a consistência e o original continua desfazível', () => {
    const original = deepFreeze(messy());
    const before = analyzeSheetHealth(original);
    let current: Sheet = original;
    for (const proposed of before.fixes) current = applyHealthFix(current, proposed.fix);

    const after = analyzeSheetHealth(current);
    assert.equal(after.dataRows, 5);
    assert.equal(after.duplicateRows, 0);
    assert.equal(after.columns.find(c => c.header === 'Nome')!.whitespaceCells, 0);
    assert.equal(after.columns.find(c => c.header === 'Data')!.divergentDates, false);
    // Sobra só o 'abc' na coluna numérica: 4 de 5 linhas consistentes.
    assert.ok(Math.abs(after.consistencyPercent - 80) < 1e-9);
    assert.ok(after.consistencyPercent > before.consistencyPercent);
    assert.deepEqual(analyzeSheetHealth(original), before);
  });

  it('não mexe em células com fórmula', () => {
    const sheet = makeSheet('f', 'F', ['Nome'], [['x ']]);
    const withFormula: Sheet = {
      ...sheet,
      data: { ...sheet.data, [cellPosToKey(2, 0)]: { raw: '=A2', value: 'y  ' } },
    };
    const fixed = applyHealthFix(withFormula, { kind: 'trim_spaces', columns: ['Nome'] });
    assert.equal(fixed.data[cellPosToKey(1, 0)].value, 'x');
    assert.equal(fixed.data[cellPosToKey(2, 0)].value, 'y  ');
    assert.equal(fixed.data[cellPosToKey(2, 0)].raw, '=A2');
  });

  it('remover duplicados recusa planilhas com fórmulas ou células mescladas', () => {
    const sheet = makeSheet('f', 'F', ['A'], [['x'], ['x']]);
    const withFormula: Sheet = { ...sheet, data: { ...sheet.data, [cellPosToKey(5, 3)]: { raw: '=A2', value: 'x' } } };
    const r1 = previewHealthFix(withFormula, { kind: 'remove_duplicates' });
    assert.equal(r1.removedRows, 0);
    assert.equal(r1.sheet, withFormula);
    assert.match(r1.skipped.join(' '), /fórmulas/);

    const merged: Sheet = { ...sheet, mergedRegions: [{ id: 'm', startRow: 0, startCol: 0, endRow: 0, endCol: 1 }] };
    assert.match(previewHealthFix(merged, { kind: 'remove_duplicates' }).skipped.join(' '), /mescladas/);
  });

  it('entradas inválidas viram "skipped", nunca exceção', () => {
    const sheet = messy();
    const bad: unknown[] = [
      null,
      { kind: 'apagar_tudo' },
      { kind: 'trim_spaces', columns: 'Nome' },
      { kind: 'standardize_type', column: 'Valor', to: 'bool' },
      { kind: 'normalize_dates', column: 'Data', to: 'mm/dd/yyyy' },
      { kind: 'trim_spaces', columns: ['Inexistente'] },
      { kind: 'trim_spaces', columns: ['__proto__', 'constructor'] },
    ];
    for (const fix of bad) {
      const preview = previewHealthFix(sheet, fix as never);
      assert.equal(preview.changedCells, 0);
      assert.ok(preview.skipped.length > 0, JSON.stringify(fix));
    }
  });
});

describe('dates', () => {
  it('reconhece formatos e valida datas reais', () => {
    assert.deepEqual(parseDateText('5/1/2023'), { format: 'dd/mm/yyyy', year: 2023, month: 1, day: 5, valid: true });
    assert.equal(parseDateText('29/02/2024')?.valid, true);
    assert.equal(parseDateText('29/02/2023')?.valid, false);
    assert.equal(parseDateText('2023-13-01')?.valid, false);
    assert.equal(parseDateText('texto'), null);
    assert.equal(parseDateText('1/2/70')?.year, 1970);
    assert.equal(parseDateText('1/2/69')?.year, 2069);
  });

  it('formata com zeros à esquerda', () => {
    assert.equal(formatDate({ year: 2023, month: 1, day: 5 }, 'dd-mm-yyyy'), '05-01-2023');
    assert.equal(formatDate({ year: 2023, month: 1, day: 5 }, 'yyyy/mm/dd'), '2023/01/05');
    assert.equal(formatDate({ year: 2005, month: 1, day: 5 }, 'dd/mm/yy'), '05/01/05');
  });
});
