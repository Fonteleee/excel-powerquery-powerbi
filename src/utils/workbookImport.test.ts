// src/utils/workbookImport.test.ts
// Reproduz o arquivo que falhava: aba de resumo com título, observação, linha em branco, tabela e outro bloco.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { cellPosToKey } from '../engine/formulaParser';
import { autoFormatTabularData } from './csvAutoFormatter';
import { detectHeaderRow, tableBlockEnd } from './tableLayout';
import { importWorkbookFile, workbookToSheets } from './workbookImport';
import { numberFormatOf } from './xlsxStyles';

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
    // Importação fiel: o cabeçalho não ganha cor própria quando o arquivo não tem estilo.
    assert.equal(map.data[cellPosToKey(0, 0)].format?.bgColor, undefined);
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

describe('importação fiel ao arquivo', () => {
  const enc = (s: string) => ({ content: new TextEncoder().encode(s) });
  const files = {
    'xl/workbook.xml': enc('<workbook><sheets><sheet name="Fila" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/theme/theme1.xml': enc('<a:theme><a:dk1><a:sysClr lastClr="000000"/></a:dk1><a:accent1><a:srgbClr val="5B9BD5"/></a:accent1></a:theme>'),
    'xl/styles.xml': enc(
      '<styleSheet><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill></fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom></border></borders>' +
        '<cellXfs count="3"><xf fontId="0" fillId="0" borderId="0"/>' +
        '<xf fontId="1" fillId="2" borderId="1"><alignment horizontal="center" wrapText="1"/></xf>' +
        '<xf fontId="0" fillId="2" borderId="0"/></cellXfs></styleSheet>'
    ),
    'xl/worksheets/sheet1.xml': enc('<worksheet><sheetData><row r="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" s="2"/></row></sheetData></worksheet>'),
  };

  it('traz fonte, cor de fundo, borda e alinhamento do arquivo', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Fila', ''], ['A', 5]]);
    ws['!cols'] = [{ wpx: 240 }];
    ws['!rows'] = [{ hpx: 40 }];
    ws['!autofilter'] = { ref: 'A1:B2' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fila');
    (wb as unknown as { files: unknown }).files = files;
    const sheet = workbookToSheets(wb).sheets[0];
    const head = sheet.data[cellPosToKey(0, 0)];
    assert.equal(head.value, 'Fila');
    assert.equal(head.format?.bgColor, '#1f4e78');
    assert.equal(head.format?.textColor, '#ffffff');
    assert.equal(head.format?.bold, true);
    assert.equal(head.format?.fontSize, 14);
    assert.equal(head.format?.align, 'center');
    assert.equal(head.format?.wrap, true);
    assert.equal(head.format?.border?.bottom, true);
    assert.equal(sheet.data[cellPosToKey(0, 1)].format?.bgColor, '#1f4e78'); // célula vazia pintada continua pintada
    assert.equal(sheet.colWidths[0], 240);
    assert.equal(sheet.rowHeights[0], 40);
    assert.equal(sheet.filterEnabled, true);
  });

  it('formatos numéricos do Excel viram o tipo de formato', () => {
    assert.deepEqual(numberFormatOf('0.00%'), { type: 'percentage', decimals: 2 });
    assert.deepEqual(numberFormatOf('#,##0.00'), { type: 'number', decimals: 2 });
    assert.deepEqual(numberFormatOf('"R$" #,##0.00'), { type: 'currency', decimals: 2 });
    assert.equal(numberFormatOf('General'), undefined);
  });
});

describe('importação de formatação condicional, gráficos, imagens e ocultos', () => {
  const enc = (s: string) => ({ content: new TextEncoder().encode(s) });
  const files = {
    'xl/workbook.xml': enc('<workbook><sheets><sheet name="Vendas" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/styles.xml': enc(
      '<styleSheet><dxfs count="1"><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs></styleSheet>'
    ),
    'xl/worksheets/sheet1.xml': enc(
      '<worksheet><sheetData/>' +
        '<conditionalFormatting sqref="B2:B5"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>10</formula></cfRule></conditionalFormatting>' +
        '<conditionalFormatting sqref="C2:C5"><cfRule type="colorScale" priority="2"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFFFFFFF"/><color rgb="FF63BE7B"/></colorScale></cfRule></conditionalFormatting>' +
        '</worksheet>'
    ),
    'xl/worksheets/_rels/sheet1.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="../drawings/drawing1.xml"/></Relationships>'),
    'xl/drawings/drawing1.xml': enc(
      '<xdr:wsDr>' +
        '<xdr:twoCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
        '<xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
        '<xdr:graphicFrame><a:graphic><a:graphicData><c:chart r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame></xdr:twoCellAnchor>' +
        '<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="952500" cy="476250"/>' +
        '<xdr:pic><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor>' +
        '</xdr:wsDr>'
    ),
    'xl/drawings/_rels/drawing1.xml.rels': enc(
      '<Relationships><Relationship Id="rId1" Target="../charts/chart1.xml"/><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>'
    ),
    'xl/charts/chart1.xml': enc(
      '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Vendas por mês</a:t></a:r></a:p></c:rich></c:tx></c:title>' +
        '<c:plotArea><c:lineChart><c:ser><c:tx><c:strRef><c:f>Vendas!$B$1</c:f></c:strRef></c:tx>' +
        '<c:cat><c:strRef><c:f>Vendas!$A$2:$A$5</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Vendas!$B$2:$B$5</c:f></c:numRef></c:val></c:ser></c:lineChart></c:plotArea></c:chart></c:chartSpace>'
    ),
    'xl/media/image1.png': { content: new Uint8Array([137, 80, 78, 71]) },
  };

  const ws = XLSX.utils.aoa_to_sheet([['Mês', 'Vendas', 'Meta'], ['Jan', 5, 1], ['Fev', 12, 2], ['Mar', 8, 3], ['Abr', 15, 4]]);
  ws['!cols'] = [{ wpx: 100 }, { hidden: true, wpx: 100 }, { wpx: 100 }];
  ws['!rows'] = [{}, {}, { hidden: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
  (wb as unknown as { files: unknown }).files = files;
  const sheet = workbookToSheets(wb).sheets[0];

  it('regras de formatação condicional entram com a cor do estilo do arquivo', () => {
    const [greater, scale] = sheet.conditionalRules;
    assert.equal(greater.type, 'highlight_greater');
    assert.equal(greater.value1, 10);
    assert.equal(greater.style.bgColor, '#ffc7ce');
    assert.equal(greater.style.textColor, '#9c0006');
    assert.deepEqual([greater.range.startRow, greater.range.endRow, greater.range.startCol], [1, 4, 1]);
    assert.equal(scale.type, 'color_scale_3');
    assert.equal(scale.style.maxColor, '#63be7b');
  });

  it('colunas e linhas ocultas são guardadas', () => {
    assert.deepEqual(sheet.hiddenCols, [1]);
    assert.deepEqual(sheet.hiddenRows, [2]);
  });

  it('o gráfico vira gráfico da planilha, sobre o intervalo certo e na posição do arquivo', () => {
    assert.equal(sheet.charts?.length, 1);
    const chart = sheet.charts![0];
    assert.equal(chart.title, 'Vendas por mês');
    assert.equal(chart.type, 'line');
    assert.equal(chart.range, 'A1:B5');
    assert.ok(chart.x > 300 && chart.width >= 240 && chart.height >= 160);
  });

  it('a imagem entra embutida, no tamanho do arquivo', () => {
    assert.equal(sheet.images?.length, 1);
    assert.match(sheet.images![0].src, /^data:image\/png;base64,/);
    assert.deepEqual([sheet.images![0].width, sheet.images![0].height], [100, 50]);
  });
});

describe('textos longos', () => {
  const longo = 'Regra explícita sua (ou já aprovada no v4). Entra no mapeamento sem decisão sua, mas confira cada linha antes de usar o resultado final.';
  const sheet = autoFormatTabularData([['Status', 'VQs', 'Significado'], ['CONFIRMADO', 73, longo], ['SUGERIDO', 18, 'curto']], 'T');

  it('o texto longo quebra em linhas em vez de ser cortado, e a linha cresce', () => {
    assert.equal(sheet.data[cellPosToKey(1, 2)].format?.wrap, true);
    assert.equal(sheet.data[cellPosToKey(1, 2)].value, longo);
    assert.ok((sheet.rowHeights[1] ?? 0) > 40);
  });

  it('texto curto e números não quebram', () => {
    assert.equal(sheet.data[cellPosToKey(2, 2)].format?.wrap, undefined);
    assert.equal(sheet.data[cellPosToKey(1, 1)].format?.wrap, undefined);
    assert.equal(sheet.rowHeights[2], 28);
  });
});
