// src/features/relations/ui/nodeText.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeResult, summarizeTransform } from './nodeText';

describe('summarizeTransform', () => {
  it('lookup configurado mostra as chaves e as colunas de retorno', () => {
    const s = summarizeTransform({ op: 'lookup', sourceKey: 'Id', lookupKey: 'Agente ID', returns: ['Motivo', 'Minutos'], ifNotFound: '' });
    assert.equal(s.excelName, 'PROCX');
    assert.equal(s.lines[0], 'Id ⇄ Agente ID');
    assert.equal(s.lines[1], '+ Motivo, Minutos');
    assert.equal(s.needsSetup, false);
  });

  it('lookup sem chaves ou sem retorno pede configuração', () => {
    assert.equal(summarizeTransform({ op: 'lookup', sourceKey: '', lookupKey: '', returns: [], ifNotFound: '' }).needsSetup, true);
    const noReturn = summarizeTransform({ op: 'lookup', sourceKey: 'A', lookupKey: 'B', returns: [], ifNotFound: '' });
    assert.equal(noReturn.needsSetup, true);
    assert.match(noReturn.lines[1], /nenhuma coluna/);
  });

  it('aggregate descreve agrupamento e métrica', () => {
    const s = summarizeTransform({
      op: 'aggregate',
      groupBy: ['Agente ID'],
      aggregations: [{ column: 'Minutos', agg: 'SUM' }, { column: 'Valor', agg: 'AVG' }],
    });
    assert.deepEqual(s.lines, ['por Agente ID', 'SUM Minutos +1']);
    assert.equal(summarizeTransform({ op: 'aggregate', groupBy: [], aggregations: [{ column: 'M', agg: 'SUM' }] }).lines[0], 'total geral');
    assert.equal(summarizeTransform({ op: 'aggregate', groupBy: [], aggregations: [] }).needsSetup, true);
  });

  it('filter descreve a primeira condição', () => {
    const s = summarizeTransform({ op: 'filter', conditions: [{ column: 'Minutos', operator: '>=', value: '10' }] });
    assert.equal(s.lines[0], 'Minutos >= 10');
    assert.equal(summarizeTransform({ op: 'filter', conditions: [] }).needsSetup, true);
  });

  it('trunca textos longos', () => {
    const s = summarizeTransform({ op: 'filter', conditions: [{ column: 'Uma coluna com nome enorme demais', operator: '=', value: 'x' }] });
    assert.ok(s.lines[0].length <= 30);
  });
});

describe('describeResult', () => {
  it('sem resultado ainda está calculando', () => {
    assert.deepEqual(describeResult(undefined), { text: 'Calculando…', tone: 'idle' });
  });

  it('erro usa a causa original', () => {
    const d = describeResult({ table: null, error: 'A entrada tem erro', rootCause: 'Coluna "X" não encontrada' });
    assert.equal(d.tone, 'error');
    assert.match(d.text, /Coluna "X"/);
  });

  it('lookup mostra taxa de match e órfãos, com alerta quando há órfãos', () => {
    const base = { table: { headers: [], rows: [] }, error: null };
    const lookup = { sourceRows: 4, matched: 2, orphans: 2, matchRate: 50, duplicateLookupKeys: 0, cardinality: '1:1' as const };
    assert.deepEqual(describeResult({ ...base, lookup }), { text: '50% · 2 órfãos', tone: 'warn' });
    const clean = describeResult({ ...base, lookup: { ...lookup, matched: 4, orphans: 0, matchRate: 100 } });
    assert.deepEqual(clean, { text: '100% · sem órfãos', tone: 'ok' });
  });

  it('demais nós mostram a quantidade de linhas', () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ a: i }));
    assert.equal(describeResult({ table: { headers: ['a'], rows }, error: null }).text, '1,5 mil linhas');
  });
});
