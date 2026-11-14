// src/utils/excelFallback.test.ts — resultado do Excel como reserva e recuo (indent) das células.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { recalculateSheet } from '../engine/formulaParser';
import { importWorkbookFile } from './workbookImport';
import { buildXlsx } from './xlsxWriter';

async function arquivo(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dados');
  ws.getCell('A1').value = 'Grupo';
  ws.getCell('A2').value = 'VQ_A';
  ws.getCell('A2').alignment = { indent: 2 };
  // O Excel guardou "VQ_X", mas a fórmula devolve vazio no nosso motor: a célula não pode ficar em branco.
  ws.getCell('B1').value = { formula: 'IF(1=0,"x","")', result: 'VQ_X' };
  ws.getCell('B2').value = { formula: 'FUNCAOINEXISTENTE(1)', result: 'VQ_Y' };
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('resultado do Excel como reserva', () => {
  it('mantém o valor do arquivo quando o motor devolve vazio ou erro, mesmo após novos recálculos', async () => {
    const { sheets } = importWorkbookFile(await arquivo(), 'f.xlsx');
    let sheet = recalculateSheet(sheets[0], sheets);
    sheet = recalculateSheet(sheet, [sheet]);
    assert.equal(sheet.data['R0C1'].value, 'VQ_X');
    assert.equal(sheet.data['R1C1'].value, 'VQ_Y');
    assert.ok(!sheet.data['R1C1'].error);
  });
});

describe('recuo de célula', () => {
  it('importa o recuo e o devolve na exportação', async () => {
    const [sheet] = importWorkbookFile(await arquivo(), 'f.xlsx').sheets;
    assert.equal(sheet.data['R1C0'].format?.indent, 2);
    const [back] = importWorkbookFile(new Uint8Array(await buildXlsx([sheet])), 'g.xlsx').sheets;
    assert.equal(back.data['R1C0'].format?.indent, 2);
  });
});
