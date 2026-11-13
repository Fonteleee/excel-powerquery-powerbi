// src/utils/freezeOutline.test.ts — painéis congelados e agrupamento (estrutura de tópicos) do Excel.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { importWorkbookFile } from './workbookImport';
import { buildXlsx } from './xlsxWriter';

async function arquivo(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dados', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  for (let r = 1; r <= 8; r++) ws.addRow([`A${r}`, `B${r}`, r, r * 2]);
  [4, 5, 6].forEach(r => {
    ws.getRow(r).outlineLevel = 1;
    ws.getRow(r).hidden = true;
  });
  ws.getColumn(4).outlineLevel = 1;
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: true };
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('congelar e agrupar', () => {
  it('importa linhas/colunas congeladas, níveis de grupo e a posição do botão', async () => {
    const [sheet] = importWorkbookFile(await arquivo(), 'f.xlsx').sheets;
    assert.equal(sheet.frozenRows, 3);
    assert.equal(sheet.frozenCols, 2);
    assert.deepEqual(sheet.rowLevels, { 3: 1, 4: 1, 5: 1 });
    assert.deepEqual(sheet.colLevels, { 3: 1 });
    assert.deepEqual(sheet.hiddenRows, [3, 4, 5]);
    assert.equal(sheet.outlineSummaryAbove, true);
  });

  it('exporta e reimporta sem perder o congelamento nem os grupos', async () => {
    const [sheet] = importWorkbookFile(await arquivo(), 'f.xlsx').sheets;
    const bytes = new Uint8Array(await buildXlsx([sheet]));
    const [back] = importWorkbookFile(bytes, 'g.xlsx').sheets;
    assert.equal(back.frozenRows, 3);
    assert.equal(back.frozenCols, 2);
    assert.deepEqual(back.rowLevels, { 3: 1, 4: 1, 5: 1 });
    assert.deepEqual(back.colLevels, { 3: 1 });
    assert.equal(back.outlineSummaryAbove, true);
  });
});
