// src/features/relations/sql/injection.test.ts
// Testes de injeção: nomes de coluna/aba e valores hostis nunca podem sair do literal/identificador.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { FlowGraph } from '../model/graph';
import { NodeDuckDb, openNodeDuckDb } from '../testing/duckdbNode';
import { edge, graphOf, makeSheet, outputNode, table, transformNode } from '../testing/fixtures';
import { duckdbDialect, postgresDialect } from './dialects';
import { commentText, escapeLikeText } from './dialects/common';
import { exportFlowAsSql } from './index';
import { checkSqlParity } from './parity';
import { SqlSafetyError } from './types';

/**
 * Percorre o SQL como um tokenizador: devolve o que sobra FORA de literais, identificadores e comentários.
 * Se a injeção escapasse das aspas, `DROP`, `;` extra ou `/*` apareceriam aqui.
 */
function skeleton(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      out += c === "'" ? "''" : '""';
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const HOSTILE_SHEET = `Ev"il'; DROP TABLE "Vendas"; --`;
const HOSTILE_COLUMNS = [`Id"x`, `Nome'; DROP TABLE t; --`, `Eq/*ui*/pe;`, `100% _real_ \\ barra`];
const HOSTILE_VALUE = `'; DROP TABLE "Vendas"; -- /* x */ \\ %_`;

function hostileSheets() {
  return [
    makeSheet(
      'h1',
      HOSTILE_SHEET,
      HOSTILE_COLUMNS,
      [
        ['k1', `a'b`, '1.5', HOSTILE_VALUE],
        ['K2', 'c"d', '2', `--x`],
        ['k3', `e;f`, '3', `/*y*/`],
      ]
    ),
    makeSheet('h2', 'Busca', [HOSTILE_COLUMNS[0], 'Valor"; --'], [['K1', 'um'], ['k2', 'dois']]),
  ];
}

function hostileGraph(): FlowGraph {
  return graphOf(
    [
      table('t1', 'h1'),
      table('t2', 'h2'),
      transformNode(
        'lk',
        { op: 'lookup', sourceKey: HOSTILE_COLUMNS[0], lookupKey: HOSTILE_COLUMNS[0], returns: ['Valor"; --'], ifNotFound: `n'/*a*/--` , prefix: `p"; DROP` },
        `rótulo\nDROP TABLE x; --\r\n/* quebra */`
      ),
      transformNode('f', {
        op: 'filter',
        conditions: [
          { column: HOSTILE_COLUMNS[1], operator: '<>', value: HOSTILE_VALUE },
          { column: HOSTILE_COLUMNS[3], operator: 'contains', value: '%_' },
          { column: HOSTILE_COLUMNS[2], operator: '<>', value: `x'--` },
        ],
      }),
      outputNode('out', `Saída"; DROP TABLE y; --`),
    ],
    [edge('e1', 't1', 'lk'), edge('e2', 't2', 'lk', 'lookup'), edge('e3', 'lk', 'f'), edge('e4', 'f', 'out')]
  );
}

describe('injeção: scripts gerados', () => {
  for (const dialect of ['duckdb', 'postgres'] as const) {
    it(`nada escapa de aspas em ${dialect} (nomes e valores hostis)`, () => {
      const result = exportFlowAsSql(hostileGraph(), hostileSheets(), { dialect, outputMode: 'create_table' });
      assert.ok(result.ok, result.ok ? '' : result.errors.join('; '));
      const outside = skeleton(result.sql);

      assert.ok(!/DROP/i.test(outside), 'DROP fora de aspas');
      assert.ok(!outside.includes('/*'), 'comentário de bloco fora de aspas');
      assert.ok(!outside.includes('--'), 'comentário de linha fora de aspas');
      // Cada instrução termina em um único ";" (CREATE TABLE/INSERT de entrada + consulta).
      const statements = result.setup.length + result.queries.length;
      assert.equal(outside.split(';').length - 1, statements);
    });
  }

  it('rótulos de nó com quebra de linha não saem do comentário', () => {
    const result = exportFlowAsSql(hostileGraph(), hostileSheets(), { outputMode: 'select' });
    assert.ok(result.ok);
    for (const line of result.sql.split('\n')) {
      assert.ok(!/^\s*DROP/i.test(line), line);
    }
    assert.ok(!result.sql.includes('\r'));
  });

  it('aspas duplas de identificadores são dobradas e aspas simples de literais também', () => {
    for (const dialect of [duckdbDialect, postgresDialect]) {
      assert.equal(dialect.quoteIdent('a"b'), '"a""b"');
      assert.equal(dialect.stringLiteral("a'b"), "'a''b'");
      assert.equal(dialect.quoteIdent('x; DROP TABLE y; --'), '"x; DROP TABLE y; --"');
    }
  });

  it('PostgreSQL usa E-string para barra invertida (independe de standard_conforming_strings)', () => {
    assert.equal(postgresDialect.stringLiteral('a\\b'), "E'a\\\\b'");
    assert.equal(postgresDialect.stringLiteral("a\\'b"), "E'a\\\\''b'");
    assert.equal(duckdbDialect.stringLiteral('a\\b'), "'a\\b'");
  });

  it('LIKE escapa %, _ e o próprio caractere de escape', () => {
    assert.equal(escapeLikeText('100%_!'), '100!%!_!!');
    assert.equal(duckdbDialect.likeContains('x', '5%'), "x LIKE '%5!%%' ESCAPE '!'");
  });

  it('recusa nomes com caracteres de controle, NUL, quebra de linha e marcas bidirecionais', () => {
    const bad = ['a\nb', 'a\u0000b', 'a\tb', 'a\rb', 'a‮b', 'a b', 'a\u0085b', ''];
    for (const name of bad) {
      assert.throws(() => duckdbDialect.quoteIdent(name), SqlSafetyError, JSON.stringify(name));
    }
    assert.throws(() => duckdbDialect.stringLiteral('a\u0000b'), SqlSafetyError);
    assert.throws(() => postgresDialect.stringLiteral('a\\\u0000b'), SqlSafetyError);
    assert.throws(() => duckdbDialect.numberLiteral(Number.NaN), SqlSafetyError);
    assert.throws(() => duckdbDialect.numberLiteral(Number.POSITIVE_INFINITY), SqlSafetyError);
  });

  it('nome de coluna com caractere de controle vira erro de compilação (não SQL)', () => {
    const sheets = [makeSheet('x', 'X', ['bom', 'ruim\u0001'], [[1, 2]])];
    const g = graphOf([table('t', 'x'), outputNode('o')], [edge('e', 't', 'o')]);
    const result = exportFlowAsSql(g, sheets);
    assert.ok(!result.ok);
  });

  it('comentários não carregam quebras de linha nem controles', () => {
    assert.equal(commentText('a\nb\r\nc\u0000d'), 'a b c d');
    assert.ok(commentText('x'.repeat(500)).length < 200);
  });
});

describe('injeção: execução real no DuckDB-WASM', () => {
  let duck: NodeDuckDb | null = null;
  before(async () => {
    duck = await openNodeDuckDb();
  });
  after(() => duck?.close());

  it('o script hostil roda, devolve os mesmos dados do motor em JS e não toca nas outras tabelas', async t => {
    if (!duck) return t.skip('DuckDB-WASM indisponível');
    await duck.run('CREATE TABLE "Vendas" (a INTEGER)');
    await duck.run('INSERT INTO "Vendas" VALUES (1), (2)');

    const report = await checkSqlParity(hostileGraph(), hostileSheets(), duck.run);
    assert.deepEqual(report.errors, []);
    assert.ok(report.ok, JSON.stringify(report.targets));
    assert.equal(report.targets[0].expectedRows, 1, 'o filtro hostil deve manter exatamente 1 linha');

    const survivors = await duck.run('SELECT COUNT(*) AS n FROM "Vendas"');
    assert.equal(Number(survivors[0].n), 2);
    await duck.run('DROP TABLE "Vendas"');
  });
});
