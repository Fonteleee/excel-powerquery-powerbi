// src/features/relations/ui/healthModel.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeSheetHealth } from '../analysis/health';
import { createEmptyGraph } from '../model/graph';
import { graphOf, makeSheet, table } from '../testing/fixtures';
import { applyFixToSheets, healthTargetSheet, previewFixEffect, summarizeHealth } from './healthModel';

const sujo = () =>
  makeSheet('s1', 'Sujo', ['Id', 'Nome'], [['A1', 'Ana '], ['A2', ' Bruno'], ['A3', 'Carla'], ['A1', 'Ana ']]);
const limpo = () => makeSheet('s2', 'Limpo', ['Id'], [['A'], ['B']]);

describe('healthTargetSheet', () => {
  it('usa a tabela selecionada; sem seleção, a primeira tabela; sem tabelas, null', () => {
    const sheets = [sujo(), limpo()];
    const g = graphOf([table('t1', 's1'), table('t2', 's2')], []);
    assert.equal(healthTargetSheet(g, 't2', sheets)?.id, 's2');
    assert.equal(healthTargetSheet(g, null, sheets)?.id, 's1');
    assert.equal(healthTargetSheet(g, 'inexistente', sheets)?.id, 's1');
    assert.equal(healthTargetSheet(createEmptyGraph(), null, sheets), null);
  });
});

describe('summarizeHealth e correções', () => {
  it('resume e lista colunas com problema', () => {
    const s = summarizeHealth(analyzeSheetHealth(sujo()));
    assert.equal(s.sheetName, 'Sujo');
    assert.ok(s.problemColumns.some(c => c.header === 'Nome'));
    assert.match(s.headline, /duplicata/);
  });

  it('applyFixToSheets devolve nova lista sem mutar a original e recusa no-op', () => {
    const sheets = [sujo(), limpo()];
    const fix = analyzeSheetHealth(sheets[0]).fixes.find(f => f.fix.kind === 'trim_spaces')!.fix;
    assert.match(previewFixEffect(sheets[0], fix).text, /alterada/);
    const out = applyFixToSheets(sheets, 's1', fix);
    assert.ok(out.ok);
    if (out.ok) {
      assert.notEqual(out.sheets[0], sheets[0]);
      assert.equal(out.sheets[1], sheets[1]);
      assert.ok(out.effect.changedCells > 0);
    }
    const again = applyFixToSheets(out.ok ? out.sheets : sheets, 's1', fix);
    assert.equal(again.ok, false);
    assert.equal(applyFixToSheets(sheets, 'nope', fix).ok, false);
  });
});
