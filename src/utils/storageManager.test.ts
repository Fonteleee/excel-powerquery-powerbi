// src/utils/storageManager.test.ts
// O sistema precisa abrir sempre vazio, mesmo que exista dado de sessões anteriores no navegador.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  createBlankWorkspace,
  loadInitialSheetsSync,
  loadSheetsFromStorageAsync,
  resetWorkspaceStorage,
  saveSheetsToStorage,
  START_EMPTY_WORKSPACE,
} from './storageManager';

const g = globalThis as { localStorage?: Storage };
const original = g.localStorage;

function fakeStorage(initial: Record<string, string>): Storage & { dump(): Record<string, string> } {
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

describe('workspace sempre vazio', () => {
  it('está configurado para abrir vazio', () => {
    assert.equal(START_EMPTY_WORKSPACE, true);
  });

  it('começa com uma única tabela sem nenhum dado', () => {
    const sheets = loadInitialSheetsSync();
    assert.equal(sheets.length, 1);
    assert.deepEqual(sheets[0].data, {});
    assert.deepEqual(createBlankWorkspace()[0].data, {});
  });

  it('ignora planilhas guardadas por sessões anteriores', async () => {
    g.localStorage = fakeStorage({
      nocodb_persisted_sheets_v2: JSON.stringify([{ id: 'velha', name: 'Velha', data: { R0C0: { raw: 'x', value: 'x' } } }]),
    });
    assert.equal(loadInitialSheetsSync()[0].id, 'sheet-1');
    assert.deepEqual((await loadSheetsFromStorageAsync())[0].data, {});
  });

  it('não grava planilhas para a próxima sessão', async () => {
    const storage = fakeStorage({});
    g.localStorage = storage;
    await saveSheetsToStorage(createBlankWorkspace());
    assert.deepEqual(storage.dump(), {});
  });

  it('resetWorkspaceStorage apaga planilhas, relações e fluxo, e mantém preferências', () => {
    const storage = fakeStorage({
      nocodb_persisted_sheets_v2: '[]',
      nocodb_active_sheet_id_v2: 'velha',
      nocodb_starred_sheet_ids_v2: '[]',
      nocodb_relations_edges_v2: '[]',
      nocodb_flow_graph_v1: '{}',
      nocodb_flow_graph_v1_invalid_backup: '{}',
      nocodb_flow_view_v1: '{}',
      nocodb_user_prefs_v2: '{"zoomLevel":120}',
    });
    g.localStorage = storage;
    resetWorkspaceStorage();
    assert.deepEqual(storage.dump(), { nocodb_user_prefs_v2: '{"zoomLevel":120}' });
    assert.doesNotThrow(() => resetWorkspaceStorage());
  });
});
