// src/utils/formulaImport.test.ts — fórmulas do Excel entram como fórmulas vivas.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { recalculateSheet } from '../engine/formulaParser';
import { formatCellValue } from '../engine/formulas/formatting';
import { importWorkbookFile, keepExcelResults } from './workbookImport';

async function arquivo(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const d = wb.addWorksheet('Dados');
  d.addRow(['Regiao', 'Qtd', 'Preco', 'Total']);
  [['Sul', 2, 10], ['Norte', 5, 20], ['Sul', 3, 20]].forEach((r, i) => {
    const q = r[1] as number;
    const p = r[2] as number;
    d.addRow([...r, { formula: `B${i + 2}*C${i + 2}`, result: q * p }]);
  });
  d.getCell('F1').value = { formula: 'SUM(D2:D4)', result: 180 };
  d.getCell('F2').value = { formula: 'SUMIFS(D2:D4,A2:A4,"Sul")', result: 80 };
  d.getCell('F3').value = { formula: 'Tabela2!A1&"-x"', result: 'ok-x' };
  d.getCell('F4').value = { formula: 'FUNCAOINEXISTENTE(1)', result: 42 };
  d.getCell('F5').value = { formula: 'IF(B2>1,"sim","nao")', result: 'sim' };
  d.getCell('F6').value = { formula: 'Vendas[Valor]', result: 7 };
  d.getCell('F7').value = { formula: 'DATE(2026,10,1)', result: new Date(Date.UTC(2026, 9, 1)) };
  d.getCell('F7').numFmt = 'dd/mm/yyyy';
  wb.addWorksheet('Tabela2').getCell('A1').value = 'ok';
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('importação de fórmulas', () => {
  it('guarda a fórmula e recalcula; o que o motor não entende mantém o resultado do Excel', async () => {
    const { sheets } = importWorkbookFile(await arquivo(), 'f.xlsx');
    const calc = sheets.map(s => keepExcelResults(recalculateSheet(s, sheets)));
    const d = calc[0].data;
    assert.equal(d['R1C3'].raw, '=B2*C2');
    assert.equal(d['R1C3'].value, 20);
    assert.equal(d['R0C5'].raw, '=SUM(D2:D4)');
    assert.equal(d['R0C5'].value, 180);
    assert.equal(d['R1C5'].raw, '=SUMIFS(D2:D4;A2:A4;"Sul")');
    assert.equal(d['R1C5'].value, 80);
    assert.equal(d['R2C5'].value, 'ok-x');
    assert.equal(d['R4C5'].value, 'sim');
    assert.equal(d['R3C5'].value, 42, 'função desconhecida volta ao valor do arquivo');
    assert.ok(!d['R3C5'].error);
    assert.equal(d['R6C5'].format?.type, 'date');
    assert.equal(formatCellValue(d['R6C5'].value, d['R6C5'].format), '01/10/2026');
    assert.equal(d['R5C5'].raw, '7', 'tabela estruturada fica só como valor');
  });

  it('a fórmula importada recalcula quando o dado muda', async () => {
    const { sheets } = importWorkbookFile(await arquivo(), 'f.xlsx');
    const dados = sheets[0];
    dados.data['R1C1'] = { raw: '10', value: 10 };
    const novo = recalculateSheet(dados, sheets);
    assert.equal(novo.data['R1C3'].value, 100);
    assert.equal(novo.data['R0C5'].value, 260);
  });
});

describe('abas ocultas e Tabelas do Excel', () => {
  it('marca a aba oculta e liga o filtro de quem tem Tabela', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Visivel').getCell('A1').value = 'a';
    wb.addWorksheet('Oculta', { state: 'hidden' }).getCell('A1').value = 'b';
    wb.addWorksheet('MuitoOculta', { state: 'veryHidden' }).getCell('A1').value = 'c';
    wb.addWorksheet('ComTabela').addTable({ name: 'T', ref: 'A1', headerRow: true, columns: [{ name: 'X' }, { name: 'Y' }], rows: [[1, 2]] });
    const { sheets } = importWorkbookFile(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), 'o.xlsx');
    const by = (n: string) => sheets.find(s => s.name === n)!;
    assert.equal(by('Visivel').hidden, undefined);
    assert.equal(by('Oculta').hidden, true);
    assert.equal(by('MuitoOculta').hidden, true);
    assert.equal(by('ComTabela').filterEnabled, true);
    assert.equal(by('Visivel').filterEnabled, undefined);
  });
});
