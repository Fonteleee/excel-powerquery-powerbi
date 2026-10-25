// src/features/relations/analysis/formulaLinks.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateLegacyEdges } from '../model/legacy';
import { createEmptyGraph } from '../model/graph';
import { makeSheet, sampleSheets } from '../testing/fixtures';
import { detectFormulaLinks, linkToLegacyEdge } from './formulaLinks';

const pausas = () => sampleSheets()[1];

function agentesWith(formulas: string[][]) {
  return makeSheet('agentes', 'Agentes', ['Id', 'Nome', 'F1', 'F2'], formulas.map((f, i) => [`A0${i + 1}`, 'x', ...f]));
}

describe('detectFormulaLinks', () => {
  it('acha PROCX entre abas, mesmo dentro de SEERRO, e conta os usos', () => {
    const a = agentesWith([
      ['=SEERRO(PROCX(A2; Pausas!A:A; Pausas!C:C; "-"); 0)', ''],
      ['=SEERRO(PROCX(A3; Pausas!A:A; Pausas!C:C; "-"); 0)', ''],
    ]);
    const links = detectFormulaLinks([a, pausas()]);
    assert.equal(links.length, 1);
    assert.equal(links[0].fn, 'PROCX');
    assert.equal(links[0].sheetId, 'agentes');
    assert.equal(links[0].keyCol, 0);
    assert.equal(links[0].targetSheetId, 'pausas');
    assert.equal(links[0].targetKeyCol, 0);
    assert.equal(links[0].returnCol, 2);
    assert.equal(links[0].uses, 2);
    assert.equal(links[0].exampleAddress, 'C2');
  });

  it('entende PROCV (coluna de retorno pelo índice) e abas com espaço no nome', () => {
    const a = agentesWith([['=PROCV(A2; \'Minhas Pausas\'!A:C; 3; FALSO)', '']]);
    const p = makeSheet('pausas', 'Minhas Pausas', ['Agente ID', 'Motivo', 'Minutos'], [['A01', 'x', 1]]);
    const [link] = detectFormulaLinks([a, p]);
    assert.equal(link.fn, 'PROCV');
    assert.equal(link.returnCol, 2);
  });

  it('entende SOMASE, CONT.SE e MÉDIASE', () => {
    const a = agentesWith([
      ['=SOMASE(Pausas!A:A; A2; Pausas!C:C)', '=CONT.SE(Pausas!A:A; A2)'],
      ['=MÉDIASE(Pausas!A:A; A3; Pausas!C:C)', ''],
    ]);
    const fns = detectFormulaLinks([a, pausas()]).map(l => l.fn).sort();
    assert.deepEqual(fns, ['CONT.SE', 'MEDIASE', 'SOMASE']);
    const count = detectFormulaLinks([a, pausas()]).find(l => l.fn === 'CONT.SE')!;
    assert.equal(count.returnCol, null);
  });

  it('ignora fórmulas na mesma planilha, abas inexistentes e texto comum', () => {
    const a = agentesWith([
      ['=PROCX(A2; A:A; B:B; "")', ''],
      ['=PROCX(A3; Fantasma!A:A; Fantasma!B:B; "")', ''],
      ['=SOMA(A2:A3)', 'texto'],
    ]);
    assert.deepEqual(detectFormulaLinks([a, pausas()]), []);
  });

  it('acompanha a fórmula: sem fórmula, sem ligação', () => {
    const a = agentesWith([['=PROCX(A2; Pausas!A:A; Pausas!C:C; "")', '']]);
    assert.equal(detectFormulaLinks([a, pausas()]).length, 1);
    assert.equal(detectFormulaLinks([agentesWith([['', '']]), pausas()]).length, 0);
  });

  it('a ligação vira nós de fluxo pela migração existente', () => {
    const a = agentesWith([['=PROCX(A2; Pausas!A:A; Pausas!C:C; "")', '']]);
    const sheets = [a, pausas()];
    const [link] = detectFormulaLinks(sheets);
    const migrated = migrateLegacyEdges([linkToLegacyEdge(link)], sheets, createEmptyGraph());
    assert.equal(migrated.converted.length, 1);
    const lookup = migrated.graph.nodes.find(n => n.kind === 'transform');
    assert.ok(lookup && lookup.kind === 'transform' && lookup.params.op === 'lookup');
    if (lookup && lookup.kind === 'transform' && lookup.params.op === 'lookup') {
      assert.equal(lookup.params.sourceKey, 'Id');
      assert.equal(lookup.params.lookupKey, 'Agente ID');
      assert.deepEqual(lookup.params.returns, ['Minutos']);
    }
  });
});
