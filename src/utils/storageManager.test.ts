// src/utils/storageManager.test.ts
// Primeira abertura vazia; depois disso o trabalho do usuário volta ao atualizar a página.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createBlankWorkspace, loadInitialSheetsSync, saveSheetsToStorage } from './storageManager';

const g = globalThis as { localStorage?: Storage };
const original = g.localStorage;

function fakeStorage(initial: Record<string, string> = {}): Storage & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: key => void data.delete(key),
    clear: () => data.clear(),
    key: i => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
    dump: () => Object.fromEntries(data),
  };
}

afterEach(() => {
  if (original) g.localStorage = original;
  else delete g.localStorage;
});

describe('persistência do espaço de trabalho', () => {
  it('na primeira abertura vem uma única tabela, sem nenhum dado', () => {
    g.localStorage = fakeStorage();
    const sheets = loadInitialSheetsSync();
    assert.equal(sheets.length, 1);
    assert.deepEqual(sheets[0].data, {});
  });

  it('o que o usuário salvou volta ao atualizar a página', async () => {
    const storage = fakeStorage();
    g.localStorage = storage;
    const sheet = createBlankWorkspace()[0];
    sheet.name = 'Vendas';
    sheet.data['R0C0'] = { raw: 'Produto', value: 'Produto' };
    await saveSheetsToStorage([sheet]);
    const back = loadInitialSheetsSync();
    assert.equal(back[0].name, 'Vendas');
    assert.equal(back[0].data['R0C0'].value, 'Produto');
  });

  it('conteúdo corrompido não derruba a abertura', () => {
    g.localStorage = fakeStorage({ nocodb_persisted_sheets_v2: '{não é json' });
    assert.equal(loadInitialSheetsSync().length, 1);
  });
});
