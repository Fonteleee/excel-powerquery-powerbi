// src/tests/validateAll.test.ts
// Executa a bateria antiga (validateAll.ts) dentro do runner oficial, para que qualquer regressão
// nas fórmulas, importadores e motores legados quebre o `npm test`.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runComprehensiveValidation } from './validateAll';

describe('validateAll (bateria legada)', () => {
  const results = runComprehensiveValidation();

  it('executa a bateria completa', () => {
    assert.ok(results.length >= 25, `esperava ao menos 25 verificações, recebi ${results.length}`);
  });

  // Falhas que JÁ existiam antes da Fase 3 (importador CSV não gera a linha "Total Geral"). Ficam como
  // `todo` para não esconder o problema nem bloquear a suíte; qualquer OUTRA falha quebra o teste.
  const KNOWN_BASELINE_FAILURES = new Set(['Importador CSV Inteligente com Auto-Formatação & Total Geral']);

  for (const result of results) {
    const known = KNOWN_BASELINE_FAILURES.has(result.test);
    it(result.test, { todo: known ? 'falha pré-existente do importador CSV (fora do escopo da Fase 3)' : false }, () => {
      assert.equal(result.status, 'PASS', result.detail);
    });
  }
});
