// Ida e volta: o que sai no .xlsx tem de voltar igual na importação.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey } from '../engine/formulaParser';
import { Sheet } from '../types/spreadsheet';
import { importWorkbookFile } from './workbookImport';
import { buildXlsx } from './xlsxWriter';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function sample(): Sheet {
  const cell = (v: string | number, format?: Sheet['data'][string]['format']) => ({ raw: String(v), value: v, ...(format ? { format } : {}) });
  return {
    id: 's1',
    name: 'Vendas',
    rowCount: 100,
    colCount: 20,
    colWidths: { 0: 140, 1: 100 },
    rowHeights: { 0: 40 },
    mergedRegions: [],
    tabColor: '#2563eb',
    filterEnabled: true,
    hiddenCols: [2],
    data: {
      [cellPosToKey(0, 0)]: cell('Mês', { bold: true, bgColor: '#1f4e78', textColor: '#ffffff', align: 'center', border: { bottom: true, style: 'solid', color: '#999999' } }),
      [cellPosToKey(0, 1)]: cell('Valor', { bold: true }),
      [cellPosToKey(1, 0)]: cell('001'),
      [cellPosToKey(1, 1)]: cell(12, { type: 'number', decimals: 2 }),
      [cellPosToKey(2, 0)]: cell('Fev'),
      [cellPosToKey(2, 1)]: cell(0.25, { type: 'percentage', decimals: 1 }),
    },
    conditionalRules: [
      { id: 'a', type: 'highlight_greater', value1: 10, range: { startRow: 1, startCol: 1, endRow: 2, endCol: 1 }, style: { bgColor: '#ffc7ce', textColor: '#9c0006' } },
      { id: 'b', type: 'custom_formula', formula: '=$B2>10', anchor: { row: 1, col: 0 }, range: { startRow: 1, startCol: 0, endRow: 2, endCol: 1 }, style: { bgColor: '#c6efce' } },
    ],
    images: [{ id: 'i', src: PIXEL, x: 300, y: 80, width: 40, height: 20 }],
    validations: [{ id: 'dv-1', range: { startRow: 1, startCol: 3, endRow: 1, endCol: 3 }, values: ['Exames NDI', 'Consultas NDI'] }],
  };
}

describe('exportação .xlsx fiel', () => {
  it('estilos, ocultos, filtro, formatação condicional e imagem voltam na importação', async () => {
    const bytes = new Uint8Array(await buildXlsx([sample()]));
    const back = importWorkbookFile(bytes, 'x.xlsx').sheets[0];
    const head = back.data[cellPosToKey(0, 0)];
    assert.equal(head.value, 'Mês');
    assert.equal(head.format?.bgColor, '#1f4e78');
    assert.equal(head.format?.textColor, '#ffffff');
    assert.equal(head.format?.bold, true);
    assert.equal(head.format?.align, 'center');
    assert.equal(head.format?.border?.bottom, true);
    assert.deepEqual(back.hiddenCols, [2]);
    assert.equal(back.filterEnabled, true);
    assert.equal(back.tabColor, '#2563eb');
    assert.ok(back.colWidths[0] >= 130 && back.colWidths[0] <= 150);
    assert.equal(back.images?.length, 1);
    const types = back.conditionalRules.map(r => r.type).sort();
    assert.deepEqual(types, ['custom_formula', 'highlight_greater']);
    assert.equal(back.conditionalRules.find(r => r.type === 'custom_formula')?.formula, '=$B2>10');
    assert.deepEqual(back.validations?.[0].values, ['Exames NDI', 'Consultas NDI']);
    assert.deepEqual([back.validations?.[0].range.startRow, back.validations?.[0].range.startCol], [1, 3]);
  });

  it('código com zero à esquerda continua texto e percentual vira fração', async () => {
    const bytes = new Uint8Array(await buildXlsx([sample()]));
    const back = importWorkbookFile(bytes, 'x.xlsx').sheets[0];
    assert.equal(back.data[cellPosToKey(1, 0)].value, '001');
    assert.equal(back.data[cellPosToKey(1, 1)].value, 12);
    assert.equal(back.data[cellPosToKey(2, 1)].value, 0.25);
    assert.equal(back.data[cellPosToKey(2, 1)].format?.type, 'percentage');
  });
});
