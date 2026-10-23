// src/features/relations/excel/flowSheet.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { FlowGraph } from '../model/graph';
import { parseFlowGraph } from '../model/schema';
import { edge, graphOf, lookupFlow, outputNode, table, transformNode } from '../testing/fixtures';
import {
  FLOW_SHEET_NAME,
  flowChecksum,
  FlowSheetRows,
  parseFlowFromRows,
  serializeFlowToRows,
} from './flowSheet';
import { restoreSpreadsheetText, sanitizeSpreadsheetText } from './sanitize';
import { appendFlowSheet, extractFlowFromWorkbook, readFlowFromArrayBuffer } from './workbook';

const normalized = (graph: FlowGraph): FlowGraph => {
  const parsed = parseFlowGraph(graph);
  assert.ok(parsed.ok);
  return parsed.graph;
};

const richGraph = (): FlowGraph =>
  graphOf(
    [
      { ...table('ta', 'agentes', 10.5, -20), label: 'Agentes' },
      table('tp', 'pausas', 300, 40),
      transformNode(
        'lk',
        { op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['Motivo', 'Minutos'], ifNotFound: '-', prefix: 'P' },
        'Buscar pausas'
      ),
      transformNode('f', { op: 'filter', conditions: [{ column: 'Minutos', operator: '>=', value: '10' }] }),
      transformNode('ag', {
        op: 'aggregate',
        groupBy: ['Equipe'],
        aggregations: [{ column: 'Minutos', agg: 'SUM', outputName: 'Total' }, { column: 'Id', agg: 'COUNT' }],
      }),
      outputNode('out', 'Resumo'),
    ],
    [
      edge('e1', 'ta', 'lk'),
      edge('e2', 'tp', 'lk', 'lookup'),
      edge('e3', 'lk', 'f'),
      edge('e4', 'f', 'ag'),
      edge('e5', 'ag', 'out'),
    ]
  );

describe('sanitizeSpreadsheetText', () => {
  it('prefixa texto que começa com =, +, -, @, tab ou quebra de linha', () => {
    for (const text of ['=1+1', '+SUM(A1)', '-2', '@x', '\tabc', '\rabc', '=HYPERLINK("http://x")']) {
      assert.equal(sanitizeSpreadsheetText(text), `'${text}`);
    }
    for (const text of ['abc', '', '1=1', 'a=b', "'abc"]) {
      assert.equal(sanitizeSpreadsheetText(text), text);
    }
  });

  it('restoreSpreadsheetText desfaz só o prefixo de proteção', () => {
    assert.equal(restoreSpreadsheetText("'=1+1"), '=1+1');
    assert.equal(restoreSpreadsheetText("'abc"), "'abc");
    assert.equal(restoreSpreadsheetText('abc'), 'abc');
  });
});

describe('serializeFlowToRows / parseFlowFromRows', () => {
  it('ida e volta reconstrói exatamente o mesmo grafo', () => {
    const graph = richGraph();
    const result = parseFlowFromRows(serializeFlowToRows(graph));
    assert.ok(result.ok);
    assert.deepEqual(result.graph, normalized(graph));
    assert.equal(result.modified, false);
    assert.deepEqual(result.warnings, []);
  });

  it('grafo vazio também faz a viagem', () => {
    const empty = graphOf([], []);
    const result = parseFlowFromRows(serializeFlowToRows(empty));
    assert.ok(result.ok);
    assert.deepEqual(result.graph, empty);
  });

  it('tem uma linha por nó e por aresta, versão e checksum', () => {
    const rows = serializeFlowToRows(richGraph());
    assert.deepEqual(rows[0], ['Tipo', 'Id', 'Descrição', 'Parte', 'JSON']);
    assert.equal(rows.filter(r => r[0] === 'NODE').length, 6);
    assert.equal(rows.filter(r => r[0] === 'EDGE').length, 5);
    assert.deepEqual(rows.find(r => r[1] === 'versao')?.slice(0, 3), ['META', 'versao', '1']);
    assert.match(String(rows.find(r => r[1] === 'checksum')?.[2]), /^fnv1a-[0-9a-f]{8}$/);
  });

  it('textos que começam com = + - @ saem com apóstrofo e voltam intactos', () => {
    const graph = graphOf(
      [
        { ...table('-t1', 'aba'), label: '=CMD|calc' },
        transformNode('f', { op: 'filter', conditions: [{ column: '+Col', operator: '=', value: '@x' }] }, '-rótulo'),
        outputNode('out', '=Saída'),
      ],
      [edge('e1', '-t1', 'f'), edge('e2', 'f', 'out')]
    );
    const rows = serializeFlowToRows(graph);
    for (const row of rows) {
      for (const cell of row) {
        if (typeof cell === 'string') assert.ok(!/^[=+\-@\t\r]/.test(cell), `célula perigosa: ${cell}`);
      }
    }
    const result = parseFlowFromRows(rows);
    assert.ok(result.ok);
    assert.deepEqual(result.graph, normalized(graph));
    assert.equal(result.modified, false);
  });

  it('JSON maior que uma célula é dividido em partes e remontado', () => {
    const returns = Array.from({ length: 100 }, (_, i) => `${'"'.repeat(240)}${i}`);
    const graph = graphOf(
      [
        table('a', 'a'),
        table('b', 'b'),
        transformNode('lk', { op: 'lookup', sourceKey: 'k', lookupKey: 'k', returns, ifNotFound: '' }),
        outputNode('o'),
      ],
      [edge('e1', 'a', 'lk'), edge('e2', 'b', 'lk', 'lookup'), edge('e3', 'lk', 'o')]
    );
    const rows = serializeFlowToRows(graph);
    assert.ok(rows.filter(r => r[1] === 'lk').length > 1);
    for (const row of rows) assert.ok(String(row[4]).length <= 32_767);
    const result = parseFlowFromRows(rows);
    assert.ok(result.ok);
    assert.deepEqual(result.graph, normalized(graph));
  });

  it('detecta edição manual pelo checksum, mas ainda devolve o grafo validado', () => {
    const rows = serializeFlowToRows(richGraph()).map(r => [...r]);
    const row = rows.find(r => r[0] === 'NODE' && r[1] === 'ta')!;
    row[4] = String(row[4]).replace('"x":10.5', '"x":11.5');
    const result = parseFlowFromRows(rows);
    assert.ok(result.ok);
    assert.equal(result.modified, true);
    assert.match(result.warnings.join(' '), /editada/);
    const moved = result.graph.nodes.find(n => n.id === 'ta')!;
    assert.equal(moved.x, 11.5);
  });

  it('detecta troca do id da coluna', () => {
    const rows = serializeFlowToRows(richGraph()).map(r => [...r]);
    rows.find(r => r[0] === 'NODE' && r[1] === 'ta')![1] = 'outro';
    const result = parseFlowFromRows(rows);
    assert.ok(result.ok);
    assert.equal(result.modified, true);
  });

  it('checksum muda com qualquer parte', () => {
    assert.notEqual(flowChecksum(['a', 'b']), flowChecksum(['a', 'c']));
    assert.equal(flowChecksum(['a']), flowChecksum(['a']));
  });
});

describe('parseFlowFromRows: entrada hostil', () => {
  const good = (): FlowSheetRows => serializeFlowToRows(richGraph());
  const failure = (rows: unknown[][]): string => {
    const result = parseFlowFromRows(rows);
    assert.ok(!result.ok, 'deveria falhar');
    return result.errors.join(' | ');
  };

  it('vazio, formato e versão desconhecidos', () => {
    assert.match(failure([]), /vazia/);
    assert.match(failure([['META', 'formato', 'outro', '', '']]), /formato desconhecido/);
    const rows = good().map(r => [...r]);
    rows.find(r => r[1] === 'versao')![2] = '99';
    assert.match(failure(rows), /Versão/);
  });

  it('JSON inválido', () => {
    const rows = good().map(r => [...r]);
    rows.find(r => r[0] === 'NODE')![4] = 'j:{não é json';
    assert.match(failure(rows), /JSON inválido/);
  });

  it('JSON sem o marcador', () => {
    const rows = good().map(r => [...r]);
    rows.find(r => r[0] === 'NODE')![4] = '{"id":"x"}';
    assert.match(failure(rows), /marcador/);
  });

  it('nó inválido é recusado pelo validador do grafo', () => {
    const rows = good().map(r => [...r]);
    rows.push(['NODE', 'mau', 'x', 1, 'j:{"id":"mau","kind":"table","x":0,"y":0,"sheetId":""}']);
    assert.match(failure(rows), /sheetId/);
  });

  it('chaves proibidas e campos extras não passam para o grafo', () => {
    const rows = good().map(r => [...r]);
    const idx = rows.findIndex(r => r[0] === 'NODE' && r[1] === 'ta');
    rows[idx][4] = `j:{"id":"ta","kind":"table","x":1,"y":2,"sheetId":"agentes","__proto__":{"polluted":true},"extra":"x"}`;
    const result = parseFlowFromRows(rows);
    assert.ok(result.ok);
    const node = result.graph.nodes.find(n => n.id === 'ta')!;
    assert.equal(Object.prototype.hasOwnProperty.call(node, 'extra'), false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(result.modified, true);
  });

  it('nome de coluna proibido no JSON', () => {
    const rows = good().map(r => [...r]);
    rows.push(['NODE', 'q', 'x', 1, 'j:{"id":"q","kind":"transform","x":0,"y":0,"params":{"op":"filter","conditions":[{"column":"__proto__","operator":"=","value":"1"}]}}']);
    assert.match(failure(rows), /proibido/);
  });

  it('limites de linhas e de tamanho', () => {
    const many: unknown[][] = Array.from({ length: 50_000 }, () => ['NODE', 'x', '', 1, 'j:{}']);
    assert.match(failure(many), /linhas demais/);
    const huge = good().map(r => [...r]);
    huge.push(['NODE', 'big', 'x', 1, 'j:' + 'a'.repeat(40_000)]);
    assert.match(failure(huge), /inválida ou grande demais/);
  });

  it('partes fora de ordem e células de tipo estranho', () => {
    const rows = good().map(r => [...r]);
    rows.find(r => r[0] === 'NODE')![3] = 2;
    assert.match(failure(rows), /fora de ordem/);
    assert.match(failure([['META', { a: 1 }, '', '', '']]), /inválida/);
  });

  it('ciclo no grafo importado é recusado', () => {
    const cyclic = graphOf(
      [transformNode('a', { op: 'filter', conditions: [] }), transformNode('b', { op: 'filter', conditions: [] })],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]
    );
    assert.match(failure(serializeFlowToRows(cyclic)), /ciclo/);
  });
});

describe('aba oculta no workbook (SheetJS)', () => {
  const buildWorkbook = (graph: FlowGraph): XLSX.WorkBook => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Id'], ['A1']]), 'Agentes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Agente ID'], ['A1']]), 'Pausas');
    appendFlowSheet(wb, graph);
    return wb;
  };

  it('a aba é veryHidden e vem por último, sem alterar as demais', () => {
    const wb = buildWorkbook(lookupFlow());
    assert.deepEqual(wb.SheetNames, ['Agentes', 'Pausas', FLOW_SHEET_NAME]);
    assert.equal(wb.Workbook?.Sheets?.[2]?.Hidden, 2);
    assert.equal(wb.Workbook?.Sheets?.[0]?.Hidden, 0);
  });

  it('exportar para .xlsx e reimportar reconstrói o mesmo grafo (e a aba continua oculta)', () => {
    const graph = richGraph();
    const bytes = XLSX.write(buildWorkbook(graph), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = readFlowFromArrayBuffer(bytes);
    assert.ok(result.ok, result.ok ? '' : result.errors.join('; '));
    assert.deepEqual(result.graph, normalized(graph));
    assert.equal(result.modified, false);

    const reread = XLSX.read(bytes, { type: 'array' });
    const flowIndex = reread.SheetNames.indexOf(FLOW_SHEET_NAME);
    assert.equal(reread.Workbook?.Sheets?.[flowIndex]?.Hidden, 2);
  });

  it('nenhuma célula da aba vira fórmula, mesmo com rótulos perigosos', () => {
    const graph = graphOf(
      [{ ...table('t', 'aba'), label: '=SOMA(A1:A9)' }, outputNode('o', '+cmd')],
      [edge('e', 't', 'o')]
    );
    const wb = buildWorkbook(graph);
    const sheet = wb.Sheets[FLOW_SHEET_NAME];
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!')) continue;
      const c = cell as XLSX.CellObject;
      assert.equal(c.f, undefined, `fórmula em ${address}`);
      if (typeof c.v === 'string') assert.ok(!/^[=+\-@]/.test(c.v), `texto perigoso em ${address}: ${c.v}`);
    }
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = readFlowFromArrayBuffer(bytes);
    assert.ok(result.ok);
    assert.deepEqual(result.graph, normalized(graph));
  });

  it('appendFlowSheet é idempotente (substitui a aba existente)', () => {
    const wb = buildWorkbook(lookupFlow());
    appendFlowSheet(wb, richGraph());
    assert.equal(wb.SheetNames.filter(n => n === FLOW_SHEET_NAME).length, 1);
    const result = extractFlowFromWorkbook(wb);
    assert.ok(result.ok);
    assert.equal(result.graph.nodes.length, 6);
  });

  it('arquivo sem a aba é reportado como ausente (não como erro do arquivo)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Plan1');
    const missing = extractFlowFromWorkbook(wb);
    assert.ok(!missing.ok);
    assert.equal(missing.missing, true);
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const viaBytes = readFlowFromArrayBuffer(bytes);
    assert.ok(!viaBytes.ok);
    assert.equal(viaBytes.missing, true);
  });

  it('bytes que não são planilha viram erro amigável', () => {
    const result = readFlowFromArrayBuffer(new TextEncoder().encode('isto não é um xlsx').buffer as ArrayBuffer);
    assert.ok(!result.ok);
  });
});
