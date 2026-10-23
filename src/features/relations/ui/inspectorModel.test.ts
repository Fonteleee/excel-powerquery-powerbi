// src/features/relations/ui/inspectorModel.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LookupInspection } from '../analysis/orphans';
import { buildInspectorSections } from './inspectorModel';

const base = (): LookupInspection => ({
  nodeId: 'n',
  sourceRows: 10,
  keyedRows: 10,
  matchedRows: 10,
  orphanCount: 0,
  orphanSample: [],
  nullKeyCount: 0,
  nullKeySample: [],
  typeMismatch: { sourceKinds: {} as never, lookupKinds: {} as never, kindsDiffer: false, sourceDominant: 'number', lookupDominant: 'number', count: 0, sample: [] },
  duplicateLookup: { extraRows: 0, duplicatedKeys: 0, nullKeyRows: 0, sample: [] },
});

describe('buildInspectorSections', () => {
  it('cruzamento limpo não gera seções', () => {
    assert.deepEqual(buildInspectorSections(base()), []);
  });

  it('órfãos listam a chave e a linha da planilha (cabeçalho = linha 1)', () => {
    const i = base();
    i.orphanCount = 7;
    i.orphanSample = [{ rowIndex: 0, key: 'A-1', row: {} }, { rowIndex: 4, key: 42, row: {} }];
    const [s] = buildInspectorSections(i);
    assert.equal(s.id, 'orphans');
    assert.deepEqual(s.lines, ['“A-1” (linha 2)', '“42” (linha 6)']);
    assert.equal(s.more, 5);
  });

  it('tipos incompatíveis e duplicatas aparecem com tom próprio e truncam texto longo', () => {
    const i = base();
    i.typeMismatch = { ...i.typeMismatch, kindsDiffer: true, sourceDominant: 'text', lookupDominant: 'number', count: 1, sample: [{ rowIndex: 1, key: '001', wouldMatch: 1 }] };
    i.duplicateLookup = { extraRows: 2, duplicatedKeys: 1, nullKeyRows: 0, sample: [{ key: 'x'.repeat(60), count: 3, rowIndexes: [1, 2, 3] }] };
    const sections = buildInspectorSections(i);
    assert.deepEqual(sections.map(s => s.id), ['types', 'duplicates']);
    assert.match(sections[0].lines[0], /origem: text; busca: number/);
    assert.match(sections[0].lines[1], /“001” ≈ “1”/);
    assert.ok(sections[1].lines[0].length < 40);
    assert.equal(sections[1].tone, 'info');
  });
});
