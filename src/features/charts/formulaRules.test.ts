import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey } from '../../engine/formulaParser';
import { Sheet } from '../../types/spreadsheet';
import { formulaRuleMatches } from './formulaRules';

function sheetWith(rows: (string | number)[][], formula: string): Sheet {
  const data: Sheet['data'] = {};
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      data[cellPosToKey(r, c)] = { raw: String(v), value: v };
    })
  );
  return {
    id: 's',
    name: 'S',
    data,
    rowCount: 20,
    colCount: 5,
    colWidths: {},
    rowHeights: {},
    mergedRegions: [],
    conditionalRules: [
      { id: 'r1', type: 'custom_formula', formula, anchor: { row: 1, col: 0 }, range: { startRow: 1, startCol: 0, endRow: 4, endCol: 1 }, style: { bgColor: '#ffc7ce' } },
    ],
  };
}

const rows = [['Nome', 'Valor'], ['A', 5], ['B', 12], ['C', 30], ['D', 1]];

describe('formatação condicional por fórmula', () => {
  it('desloca a fórmula relativa para cada linha e usa $ para travar a coluna', () => {
    const hits = formulaRuleMatches(sheetWith(rows, '=$B2>10'), [0, 1, 2, 3, 4]);
    assert.deepEqual([...hits.keys()].sort(), [cellPosToKey(2, 0), cellPosToKey(2, 1), cellPosToKey(3, 0), cellPosToKey(3, 1)].sort());
  });

  it('funções em inglês e em português funcionam', () => {
    assert.equal(formulaRuleMatches(sheetWith(rows, '=AND($B2>10,$B2<20)'), [1, 2, 3, 4]).size, 2);
    assert.equal(formulaRuleMatches(sheetWith(rows, '=E($B2>10;$B2<20)'), [1, 2, 3, 4]).size, 2);
  });

  it('LIN() sem argumento vale a linha da célula (listras)', () => {
    const hits = formulaRuleMatches(sheetWith(rows, '=MOD(ROW();2)=0'), [1, 2, 3, 4]);
    assert.ok(hits.has(cellPosToKey(1, 0)) && hits.has(cellPosToKey(3, 0)));
    assert.ok(!hits.has(cellPosToKey(2, 0)));
  });

  it('fórmula com erro não pinta nada', () => {
    assert.equal(formulaRuleMatches(sheetWith(rows, '=FUNCAOINEXISTENTE($B2)'), [1, 2, 3, 4]).size, 0);
  });
});

describe('regra por fórmula que lê outra fórmula', () => {
  it('usa o valor já calculado da célula de fórmula e reaproveita o resultado ao rolar', () => {
    const sheet = sheetWith(rows, '=$C2="ALTO"');
    sheet.colCount = 5;
    // coluna C é fórmula já calculada: =IF(B2>10,"ALTO","BAIXO")
    for (let r = 1; r <= 4; r++) {
      const v = Number(rows[r][1]) > 10 ? 'ALTO' : 'BAIXO';
      sheet.data[cellPosToKey(r, 2)] = { raw: '=IF(B' + (r + 1) + '>10;"ALTO";"BAIXO")', value: v };
    }
    const hits = formulaRuleMatches(sheet, [1, 2, 3, 4]);
    assert.deepEqual([...hits.keys()].sort(), ['R2C0', 'R2C1', 'R3C0', 'R3C1']);
    // segunda chamada (cache) devolve o mesmo
    assert.deepEqual([...formulaRuleMatches(sheet, [2, 3]).keys()].sort(), ['R2C0', 'R2C1', 'R3C0', 'R3C1']);
    // outra cópia dos dados (edição) é reavaliada
    const edited = { ...sheet, data: { ...sheet.data, R2C2: { raw: 'x', value: 'BAIXO' } } };
    assert.deepEqual([...formulaRuleMatches(edited, [2, 3]).keys()].sort(), ['R3C0', 'R3C1']);
  });
});
