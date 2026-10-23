// src/features/relations/model/persistence.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edge, graphOf, table } from '../testing/fixtures';
import {
  FLOW_GRAPH_BACKUP_KEY,
  FLOW_GRAPH_STORAGE_KEY,
  FLOW_VIEW_STORAGE_KEY,
  loadFlowGraph,
  loadViewState,
  saveFlowGraph,
  saveViewState,
  StorageLike,
} from './persistence';
import { createDefaultViewState, parseViewState } from './viewState';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('persistência do grafo', () => {
  it('grava e relê o mesmo grafo', () => {
    const storage = new MemoryStorage();
    const g = graphOf(
      [table('a', 's1'), { id: 'o', kind: 'output', x: 5, y: 6, sheetName: 'Saida' }],
      [edge('e1', 'a', 'o')]
    );
    saveFlowGraph(g, storage);
    // o validador devolve `label: undefined` nos nós sem rótulo; a comparação é feita pela forma serializada
    assert.deepEqual(JSON.parse(JSON.stringify(loadFlowGraph(storage))), g);
  });

  it('devolve grafo vazio e guarda backup quando o conteúdo é inválido', () => {
    const storage = new MemoryStorage();
    storage.setItem(FLOW_GRAPH_STORAGE_KEY, '{"version":1,"nodes":[{"id":"x"}],"edges":[]}');
    assert.equal(loadFlowGraph(storage).nodes.length, 0);
    assert.match(storage.getItem(FLOW_GRAPH_BACKUP_KEY) ?? '', /"id":"x"/);
  });

  it('JSON quebrado também vira grafo vazio com backup, sem lançar', () => {
    const storage = new MemoryStorage();
    storage.setItem(FLOW_GRAPH_STORAGE_KEY, '{quebrado');
    assert.equal(loadFlowGraph(storage).edges.length, 0);
    assert.equal(storage.getItem(FLOW_GRAPH_BACKUP_KEY), '{quebrado');
  });

  it('não sobrescreve um backup já existente', () => {
    const storage = new MemoryStorage();
    storage.setItem(FLOW_GRAPH_BACKUP_KEY, 'primeiro');
    storage.setItem(FLOW_GRAPH_STORAGE_KEY, 'segundo');
    loadFlowGraph(storage);
    assert.equal(storage.getItem(FLOW_GRAPH_BACKUP_KEY), 'primeiro');
  });

  it('sem storage disponível não lança', () => {
    assert.equal(loadFlowGraph(null).nodes.length, 0);
    saveFlowGraph(graphOf([], []), null);
  });

  it('ignora erro de escrita (quota)', () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    saveFlowGraph(graphOf([], []), full);
    saveViewState(createDefaultViewState(), full);
  });
});

describe('estado de visualização', () => {
  it('relê o que gravou', () => {
    const storage = new MemoryStorage();
    const state = { ...createDefaultViewState(), collapsed: ['tbl-1'], legacyHandled: true, showKeysOnly: true };
    saveViewState(state, storage);
    assert.deepEqual(loadViewState(storage), state);
  });

  it('usa o padrão com JSON inválido', () => {
    const storage = new MemoryStorage();
    storage.setItem(FLOW_VIEW_STORAGE_KEY, 'nada');
    assert.deepEqual(loadViewState(storage), createDefaultViewState());
  });

  it('saneia tipos errados, zoom fora da faixa e listas gigantes', () => {
    const parsed = parseViewState({
      collapsed: ['a', 5, '', 'b'],
      knownSheetIds: 'não é lista',
      legacyHandled: 'sim',
      viewport: { zoom: 99, panX: Number.NaN, panY: 'x' },
    });
    assert.deepEqual(parsed.collapsed, ['a', 'b']);
    assert.deepEqual(parsed.knownSheetIds, []);
    assert.equal(parsed.legacyHandled, false);
    assert.equal(parsed.viewport.zoom, 2.5);
    assert.equal(parsed.viewport.panX, 40);
    assert.equal(parseViewState(Array.from({ length: 2000 }, () => 'x')).collapsed.length, 0);
    assert.equal(parseViewState({ collapsed: Array.from({ length: 2000 }, (_, i) => `n${i}`) }).collapsed.length, 500);
  });
});
