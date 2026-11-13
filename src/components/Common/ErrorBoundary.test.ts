// src/components/Common/ErrorBoundary.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('guarda o erro para mostrar a tela de recuperação', () => {
    assert.equal(ErrorBoundary.getDerivedStateFromError(new Error('falhou')).error?.message, 'falhou');
  });
});
