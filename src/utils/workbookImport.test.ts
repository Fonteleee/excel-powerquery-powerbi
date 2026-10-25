// src/utils/workbookImport.test.ts
// Reproduz o arquivo que falhava: aba de resumo com título, observação, linha em branco, tabela e outro bloco.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { cellPosToKey } from '../engine/formulaParser';
import { autoFormatTabularData } from './csvAutoFormatter';
import { detectHeaderRow, tableBlockEnd } from './tableLayout';
import { importWorkbookFile, workbookToSheets } from './workbookImport';

const resumo = [
  ['Mapeamento VQ → Serviço: CHAT (WhatsApp)', '', ''],
  ['Origem: widget FILAS CHAT GERAL (CSV baixado) + Serviços Segmentados 5.', '', ''],
  ['', '', ''],
  ['Status', 'VQs', 'Significado'],
  ['CONFIRMADO', 73, 'Regra explícita sua.'],
  ['SUGERIDO', 18, 'Sem regra explícita, mas o nome concorda.'],
  ['A VALIDAR', 23, 'Não há certeza.'],
  ['Total', 114, ''],
  ['', '', ''],
  ['Regras aplicadas (por prioridade)', '', ''],
  ['1. PME / PJ', '', 'Fica de lado.'],
];

const mapeamento = [
  ['VQ (widget FILAS CHAT GERAL)', 'Recebidas (Accepted)', 'Serviço sugerido', 'Status'],
  ['VQ_CHAT_APP_AUTORIZACAO_CLINIPAM@multi_media_switch', 0, 'CHAT AUTORIZAÇÃO ', 'A VALIDAR'],
  ['VQ_WPP_PF_AUTORIZACOES_HV@multi_media_switch', 12, 'CHAT AUTORIZAÇÃO ', 'CONFIRMADO'],
  ['VQ_DEFAULT_WHATSAPP@multi_media_switch', 3, 'CHAT SAC HAPVIDA', 'A VALIDAR'],
];

function buildFile(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapeamento), 'Mapeamento CHAT');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Vazia');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('detectHeaderRow', () => {
  it('pula título e observação e acha o cabeçalho da tabela', () => {
    assert.equal(detectHeaderRow(resumo), 3);
  });
  it('tabela comum começa na linha 0', () => {
    assert.equal(detectHeaderRow(mapeamento), 0);
  });
  it('sem tabela, usa a linha 0', () => {
    assert.equal(detectHeaderRow([['só um título'], ['outra linha']]), 0);
    assert.equal(detectHeaderRow([]), 0);
  });
  it('não confunde uma linha de números com cabeçalho', () => {
    assert.equal(detectHeaderRow([['Nome', 'Valor', 'Qtd'], [1, 2, 3], [4, 5, 6]]), 0);
  });
  it('o bloco da tabela termina na primeira linha em branco', () => {
    assert.equal(tableBlockEnd(resumo, 3), 7);
  });
});

describe('autoFormatTabularData com título acima da tabela', () => {
  const sheet = autoFormatTabularData(resumo, 'Resumo');
  const at = (r: number, c: number) => sheet.data[cellPosToKey(r, c)];

  it('o título fica como título (negrito), sem virar cabeçalho verde', () => {
    assert.equal(at(0, 0).value, 'Mapeamento VQ → Serviço: CHAT (WhatsApp)');
    assert.equal(at(0, 0).format?.bold, true);
    assert.equal(at(0, 0).format?.bgColor, undefined);
  });

  it('o cabeçalho é a linha 4, com estilo de cabeçalho', () => {
    assert.equal(at(3, 0).value, 'Status');
    assert.equal(at(3, 0).format?.bgColor, '#107c41');
    assert.equal(at(3, 0).format?.textColor, '#ffffff');
  });

  it('a coluna de números é numérica (alinhada e formatada), e o texto continua texto', () => {
    assert.equal(at(4, 1).value, 73);
    assert.equal(at(4, 1).format?.type, 'number');
    assert.equal(at(4, 0).value, 'CONFIRMADO');
    assert.equal(at(4, 2).format?.type, undefined);
  });

  it('o bloco abaixo da linha em branco fica como está, com título de seção em negrito', () => {
    assert.equal(at(9, 0).value, 'Regras aplicadas (por prioridade)');
    assert.equal(at(9, 0).format?.bold, true);
    assert.equal(at(10, 0).value, '1. PME / PJ');
    assert.equal(at(10, 0).format?.type, undefined);
  });
});

describe('importWorkbookFile', () => {
  const result = importWorkbookFile(buildFile(), 'Mapeamento_VQ_CHAT_v1.xlsx');

  it('importa todas as abas com conteúdo e ignora as vazias', () => {
    assert.deepEqual(result.sheets.map(s => s.name), ['Resumo', 'Mapeamento CHAT']);
    assert.deepEqual(result.skipped, ['Vazia (vazia)']);
    assert.equal(new Set(result.sheets.map(s => s.id)).size, 2);
  });

  it('cada aba tem o cabeçalho certo e números como números', () => {
    const map = result.sheets[1];
    assert.equal(map.data[cellPosToKey(0, 0)].value, 'VQ (widget FILAS CHAT GERAL)');
    assert.equal(map.data[cellPosToKey(0, 0)].format?.bgColor, '#107c41');
    assert.equal(map.data[cellPosToKey(2, 1)].value, 12);
    const resumoSheet = result.sheets[0];
    assert.equal(resumoSheet.data[cellPosToKey(3, 0)].value, 'Status');
    assert.equal(resumoSheet.data[cellPosToKey(4, 1)].value, 73);
  });

  it('mantém códigos com zeros à esquerda como texto', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código', 'Nome'], ['001', 'Ana'], ['002', 'Bia']]), 'Cod');
    const sheet = workbookToSheets(wb).sheets[0];
    assert.equal(sheet.data[cellPosToKey(1, 0)].value, '001');
  });

  it('datas formatadas entram como o texto que aparece no Excel', () => {
    // 45296 = 05/01/2024 (número de série do Excel), sem depender de fuso horário.
    const ws = XLSX.utils.aoa_to_sheet([['Data', 'Valor'], [45296, 10], [45297, 20]]);
    (ws['A2'] as XLSX.CellObject).z = 'dd/mm/yyyy';
    (ws['A3'] as XLSX.CellObject).z = 'dd/mm/yyyy';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datas');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const sheet = importWorkbookFile(bytes, 'datas.xlsx').sheets[0];
    assert.equal(sheet.data[cellPosToKey(1, 0)].value, '05/01/2024');
    assert.equal(sheet.data[cellPosToKey(2, 0)].value, '06/01/2024');
    assert.equal(sheet.data[cellPosToKey(1, 1)].value, 10);
  });

  it('células mescladas viram regiões mescladas', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Título', '', ''], ['A', 'B', 'C'], [1, 2, 3]]);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'M');
    const sheet = workbookToSheets(wb).sheets[0];
    assert.equal(sheet.mergedRegions.length, 1);
    assert.deepEqual([sheet.mergedRegions[0].startCol, sheet.mergedRegions[0].endCol], [0, 2]);
  });
});
