// src/utils/storageSaver.test.ts
// Autosave: só a aba que mudou é gravada; a cópia antiga nunca sobrescreve a nova; falhas tentam de novo.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Sheet } from '../types/spreadsheet';
import { SaveBackend, SheetsSaver, planSheetSave } from './storageManager';
import { buildSheet } from '../engine/testing/sheets';

interface Call {
  kind: 'snapshot' | 'drop' | 'db';
  ids?: string[];
  order?: string[];
  stamp?: number | string;
}

function fakeBackend(options: { failDb?: () => boolean; snapshotOk?: boolean } = {}): SaveBackend & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    writeSnapshot(sheets, stamp) {
      calls.push({ kind: 'snapshot', ids: sheets.map(s => s.id), stamp });
      return options.snapshotOk ?? true;
    },
    dropSnapshot() {
      calls.push({ kind: 'drop' });
    },
    async writeDb(changed, ids, stamp) {
      if (options.failDb?.()) throw new Error('falhou');
      calls.push({ kind: 'db', ids: changed.map(s => s.id), order: ids, stamp });
    },
  };
}

const sheetOf = (id: string, value = 1): Sheet => buildSheet(id, id, [[value]]);
const dbCalls = (b: { calls: Call[] }) => b.calls.filter(c => c.kind === 'db');

describe('autosave por aba', () => {
  it('grava só a aba que mudou e nada quando nada mudou', async () => {
    const backend = fakeBackend();
    const saver = new SheetsSaver(backend);
    const a = sheetOf('a');
    const b = sheetOf('b');
    await saver.save([a, b]);
    assert.deepEqual(dbCalls(backend)[0].ids, ['a', 'b']);

    await saver.save([a, b]); // mesmas referências
    assert.equal(dbCalls(backend).length, 1);

    const b2 = { ...b, data: { ...b.data } };
    await saver.save([a, b2]);
    assert.equal(dbCalls(backend).length, 2);
    assert.deepEqual(dbCalls(backend)[1].ids, ['b']);
    assert.deepEqual(dbCalls(backend)[1].order, ['a', 'b']);
  });

  it('planilha grande não grava a cópia do localStorage e apaga a antiga', async () => {
    const backend = fakeBackend();
    const saver = new SheetsSaver(backend);
    const big = sheetOf('big');
    for (let i = 0; i < 25000; i++) big.data[`R${i}C0`] = { raw: 'x', value: 'x' };
    await saver.save([big]);
    assert.ok(backend.calls.some(c => c.kind === 'drop'));
    assert.ok(!backend.calls.some(c => c.kind === 'snapshot'));
    assert.equal(dbCalls(backend).length, 1);
  });

  it('o que veio do banco na hidratação não é regravado', async () => {
    const backend = fakeBackend();
    const saver = new SheetsSaver(backend);
    const stored = [sheetOf('a'), sheetOf('b')];
    saver.markSavedInDb(stored);
    await saver.save(stored);
    assert.equal(dbCalls(backend).length, 0);
  });

  it('falha no banco não marca como gravado: a próxima tentativa grava de novo', async () => {
    let fail = true;
    const backend = fakeBackend({ failDb: () => fail });
    const saver = new SheetsSaver(backend);
    const a = sheetOf('a');
    await saver.save([a]);
    assert.equal(dbCalls(backend).length, 0);
    fail = false;
    await saver.save([a]);
    assert.equal(dbCalls(backend).length, 1);
  });

  it('gravações em sequência são serializadas e a última versão vence', async () => {
    const backend = fakeBackend();
    const saver = new SheetsSaver(backend);
    const v1 = sheetOf('a', 1);
    const v2 = { ...v1, data: { ...v1.data } };
    const v3 = { ...v1, data: { ...v1.data } };
    await Promise.all([saver.save([v1]), saver.save([v2]), saver.save([v3])]);
    const stamps = dbCalls(backend).map(c => Number(c.stamp));
    assert.deepEqual([...stamps].sort((x, y) => x - y), stamps);
    // a última gravação cobre v3: gravar v3 de novo não faz nada
    const before = dbCalls(backend).length;
    await saver.save([v3]);
    assert.equal(dbCalls(backend).length, before);
  });

  it('remover ou reordenar abas conta como mudança', () => {
    const a = sheetOf('a');
    const b = sheetOf('b');
    const saved = new Map([['a', a], ['b', b]]);
    assert.equal(planSheetSave(saved, [a, b]).orderChanged, false);
    assert.equal(planSheetSave(saved, [b, a]).orderChanged, true);
    const removed = planSheetSave(saved, [a]);
    assert.equal(removed.orderChanged, true);
    assert.equal(removed.changed.length, 0);
  });
});
