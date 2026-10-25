// src/features/agent/suggestions.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptySheet } from '../../data/sampleDatasets';
import { sampleSheets } from '../relations/testing/fixtures';
import { suggestionsFor } from './suggestions';

describe('suggestionsFor', () => {
  it('sem dados, sugere criar planilhas e explicar como começar', () => {
    const labels = suggestionsFor([createEmptySheet('s', 'Tabela 1')]).map(s => s.label);
    assert.ok(labels.includes('Criar controle de despesas'));
    assert.ok(labels.includes('Como começar'));
  });

  it('com dados, sugere análise; com duas planilhas, também o cruzamento', () => {
    const one = suggestionsFor([sampleSheets()[0]]).map(s => s.label);
    assert.ok(one.includes('Analisar meus dados'));
    assert.ok(!one.includes('Cruzar as planilhas'));
    const two = suggestionsFor(sampleSheets()).map(s => s.label);
    assert.ok(two.includes('Cruzar as planilhas'));
  });

  it('com seleção, a primeira sugestão explica a seleção; nunca passa de 5', () => {
    const list = suggestionsFor(sampleSheets(), 'B2:C9');
    assert.equal(list[0].label, 'Explicar B2:C9');
    assert.ok(list.length <= 5);
  });
});
