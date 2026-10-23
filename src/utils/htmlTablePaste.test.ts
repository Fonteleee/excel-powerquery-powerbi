// src/utils/htmlTablePaste.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyHtmlTable, parseHtmlTable, safeColor } from './htmlTablePaste';

describe('parseHtmlTable', () => {
  it('lê linhas, células, entidades e quebras', () => {
    const t = parseHtmlTable('<table><tr><th>Nome</th><th>Valor</th></tr><tr><td>A&amp;B&nbsp;x</td><td>1,5<br>2</td></tr></table>')!;
    assert.deepEqual(t.cells.map(c => [c.row, c.col, c.text]), [[0, 0, 'Nome'], [0, 1, 'Valor'], [1, 0, 'A&B x'], [1, 1, '1,5\n2']]);
    assert.equal(t.cells[0].bold, true);
    assert.equal(t.cells[2].bold, undefined);
  });

  it('preserva cor de fundo, cor do texto e negrito simples; rejeita cores perigosas', () => {
    const t = parseHtmlTable(
      '<table><tr><td style="background-color:#FF0000;font-weight:bold;color:rgb(0,128,0)">x</td>' +
        '<td style="background:url(javascript:alert(1))">y</td><td bgcolor="#0f0">z</td></tr></table>'
    )!;
    assert.equal(t.cells[0].bgColor, '#ff0000');
    assert.equal(t.cells[0].textColor, '#008000');
    assert.equal(t.cells[0].bold, true);
    assert.equal(t.cells[1].bgColor, undefined);
    assert.equal(t.cells[2].bgColor, '#00ff00');
    assert.equal(safeColor('expression(alert(1))'), undefined);
  });

  it('respeita colspan e rowspan deslocando as células seguintes', () => {
    const t = parseHtmlTable(
      '<table><tr><td colspan="2">T</td><td rowspan="2">R</td></tr><tr><td>a</td><td>b</td></tr></table>'
    )!;
    assert.deepEqual(t.merges, [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }, { row: 0, col: 2, rowSpan: 2, colSpan: 1 }]);
    const second = t.cells.filter(c => c.row === 1).map(c => [c.col, c.text]);
    assert.deepEqual(second, [[0, 'a'], [1, 'b']]);
    assert.equal(t.rowCount, 2);
    assert.equal(t.colCount, 3);
  });

  it('descarta script, estilo, comentários e eventos sem executar nada', () => {
    const t = parseHtmlTable(
      '<div onclick="x()"><script>alert(1)</script><!-- <table><tr><td>fantasma</td></tr></table> -->' +
        '<table><tr><td onmouseover="boom()"><img src=x onerror=alert(1)>ok<style>td{}</style></td></tr></table></div>'
    )!;
    assert.deepEqual(t.cells.map(c => c.text), ['ok']);
  });

  it('texto iniciado em "=" fica como texto (sem injeção de fórmula)', () => {
    const t = parseHtmlTable('<table><tr><td>=HYPERLINK("http://x")</td></tr></table>')!;
    assert.ok(t.cells[0].text.startsWith("'="));
  });

  it('ignora tabelas aninhadas e devolve null sem tabela', () => {
    const t = parseHtmlTable('<table><tr><td>a<table><tr><td>interna</td></tr></table></td><td>b</td></tr></table>')!;
    assert.deepEqual(t.cells.map(c => c.text), ['a', 'b']);
    assert.equal(parseHtmlTable('<p>sem tabela</p>'), null);
  });

  it('aceita HTML do Excel/Sheets sem fechar tags', () => {
    const t = parseHtmlTable('<table><tr><td>1<td>2<tr><td>3<td>4</table>')!;
    assert.deepEqual(t.cells.map(c => c.text), ['1', '2', '3', '4']);
  });
});

describe('applyHtmlTable', () => {
  it('escreve a partir da origem, mantém o original e cria mesclagens', () => {
    const t = parseHtmlTable('<table><tr><td colspan="2" style="background-color:#eee">x</td></tr><tr><td>1</td><td>2</td></tr></table>')!;
    const data = { R0C0: { raw: 'velho', value: 'velho' } };
    const r = applyHtmlTable(data, t, 1, 1, { rowCount: 10, colCount: 10 });
    assert.equal(data.R0C0.raw, 'velho');
    assert.equal(r.data.R1C1.raw, 'x');
    assert.equal(r.data.R1C1.format?.bgColor, '#eeeeee');
    assert.equal(r.data.R2C2.raw, '2');
    assert.deepEqual(r.mergedRegions[0], { id: 'paste-1-1', startRow: 1, startCol: 1, endRow: 1, endCol: 2 });
    assert.equal(r.lastRow, 2);
  });

  it('corta o que ultrapassa os limites da aba', () => {
    const t = parseHtmlTable('<table><tr><td>a</td><td>b</td></tr></table>')!;
    const r = applyHtmlTable({}, t, 0, 4, { rowCount: 5, colCount: 5 });
    assert.deepEqual(Object.keys(r.data), ['R0C4']);
  });
});
