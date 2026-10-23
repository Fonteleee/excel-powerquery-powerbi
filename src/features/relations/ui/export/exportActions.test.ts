// src/features/relations/ui/export/exportActions.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { remapSheetIdsByName } from '../../excel/remap';
import { appendFlowSheet } from '../../excel/workbook';
import { lookupFlow, sampleSheets } from '../../testing/fixtures';
import { buildSqlScript, importFlowFromFile, importWarnings, PREVIEW_CHARS, safeFileName } from './exportActions';

describe('safeFileName', () => {
  it('troca caracteres perigosos e acentos, e acrescenta a extensão', () => {
    assert.equal(safeFileName('Relatório Final', 'sql'), 'Relatorio_Final.sql');
    assert.equal(safeFileName('../../etc/passwd', 'sql'), 'etc_passwd.sql');
    assert.equal(safeFileName('a\\b:c*d?"e<f>g|h', 'sql'), 'a_b_c_d_e_f_g_h.sql');
    assert.equal(safeFileName('x\u0000y', 'sql'), 'x_y.sql');
  });

  it('nunca devolve nome vazio, oculto ou reservado do Windows', () => {
    assert.equal(safeFileName('', 'sql'), 'fluxo.sql');
    assert.equal(safeFileName('...', 'sql'), 'fluxo.sql');
    assert.equal(safeFileName('.env', 'sql'), 'env.sql');
    assert.equal(safeFileName('CON', 'sql'), 'fluxo_CON.sql');
    assert.equal(safeFileName('lpt1', 'sql'), 'fluxo_lpt1.sql');
  });

  it('limita o tamanho e normaliza a extensão', () => {
    assert.ok(safeFileName('a'.repeat(500), 'sql').length <= 64);
    assert.equal(safeFileName('abc', '.SQL'), 'abc.sql');
    assert.equal(safeFileName('abc', '../x'), 'abc.x');
    assert.equal(safeFileName('abc', ''), 'abc.txt');
  });
});

describe('buildSqlScript', () => {
  it('gera script, nome seguro e prévia', () => {
    const r = buildSqlScript(lookupFlow(), sampleSheets(), {
      dialect: 'postgres',
      outputMode: 'create_table',
      includeInputs: true,
      fileBase: 'Meu Fluxo/1',
      generatedAt: new Date(0),
    });
    assert.ok(r.ok);
    assert.equal(r.fileName, 'Meu_Fluxo_1.sql');
    assert.equal(r.dialectLabel, 'PostgreSQL');
    assert.ok(r.sql.includes('CREATE TABLE "Resultado" AS'));
    assert.equal(r.truncated, r.sql.length > PREVIEW_CHARS);
    assert.ok(r.preview.length <= PREVIEW_CHARS);
  });

  it('repassa os erros de compilação', () => {
    const r = buildSqlScript(lookupFlow({ sourceKey: 'Nada' }), sampleSheets(), {
      dialect: 'duckdb',
      outputMode: 'select',
      includeInputs: false,
    });
    assert.ok(!r.ok);
    assert.match(r.errors.join(' '), /Nada/);
  });
});

describe('importação de fluxo', () => {
  const workbookBytes = (names = true): ArrayBuffer => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Id'], ['A01']]), 'Agentes');
    appendFlowSheet(wb, lookupFlow(), names ? { sheetNames: { agentes: 'Agentes', pausas: 'Pausas' } } : {});
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  };
  const asFile = (bytes: ArrayBuffer, name = 'fluxo.xlsx') => new File([bytes], name);

  it('lê o fluxo e religa as planilhas de outra sessão pelo nome', async () => {
    const current = sampleSheets().map(s => ({ ...s, id: `novo-${s.id}` }));
    const r = await importFlowFromFile(asFile(workbookBytes()), current);
    assert.ok(r.ok);
    const ids = r.graph.nodes.flatMap(n => (n.kind === 'table' ? [n.sheetId] : []));
    assert.deepEqual(ids, ['novo-agentes', 'novo-pausas']);
    assert.match(r.warnings.join(' '), /religadas/);
    assert.equal(r.modified, false);
  });

  it('avisa quando faltam planilhas', async () => {
    const r = await importFlowFromFile(asFile(workbookBytes()), []);
    assert.ok(r.ok);
    assert.match(r.warnings.join(' '), /agentes, pausas/);
  });

  it('sem nomes gravados, mantém os ids e avisa', async () => {
    const r = await importFlowFromFile(asFile(workbookBytes(false)), sampleSheets());
    assert.ok(r.ok);
    assert.deepEqual(r.warnings, []);
  });

  it('recusa extensão errada, arquivo sem a aba e lixo', async () => {
    const wrongName = await importFlowFromFile(asFile(workbookBytes(), 'fluxo.csv'), sampleSheets());
    assert.ok(!wrongName.ok);

    const plain = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(plain, XLSX.utils.aoa_to_sheet([['x']]), 'Plan1');
    const missing = await importFlowFromFile(
      asFile(XLSX.write(plain, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer),
      sampleSheets()
    );
    assert.ok(!missing.ok);
    assert.equal(missing.missing, true);

    const junk = await importFlowFromFile(asFile(new TextEncoder().encode('lixo').buffer as ArrayBuffer), sampleSheets());
    assert.ok(!junk.ok);
  });
});

describe('remapSheetIdsByName', () => {
  const names = new Map([
    ['agentes', 'Agentes'],
    ['pausas', 'Pausas'],
  ]);

  it('religa só quando o nome é único e não altera o grafo original', () => {
    const graph = lookupFlow();
    const before = JSON.stringify(graph);
    const sheets = [
      { ...sampleSheets()[0], id: 'x1' },
      { ...sampleSheets()[1], id: 'x2' },
      { ...sampleSheets()[1], id: 'x3' }, // nome repetido: ambíguo
    ];
    const r = remapSheetIdsByName(graph, names, sheets);
    assert.equal(r.remapped, 1);
    assert.deepEqual(r.unresolved, ['pausas']);
    assert.equal(JSON.stringify(graph), before);
    assert.equal(r.graph.nodes.find(n => n.id === 'ta' && n.kind === 'table')?.kind, 'table');
  });

  it('planilhas já conhecidas não mudam', () => {
    const r = remapSheetIdsByName(lookupFlow(), names, sampleSheets());
    assert.equal(r.remapped, 0);
    assert.deepEqual(r.unresolved, []);
  });

  it('importWarnings junta os avisos', () => {
    const r = importWarnings(lookupFlow(), [], names, ['base']);
    assert.equal(r.warnings[0], 'base');
    assert.equal(r.warnings.length, 2);
  });
});
