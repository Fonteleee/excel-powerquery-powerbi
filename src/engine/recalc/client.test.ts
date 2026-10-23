// src/engine/recalc/client.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Comlink from 'comlink';
import { buildSheet, valueAt } from '../testing/sheets';
import { edge, graphOf, makeSheet, table } from '../../features/relations/testing/fixtures';
import { createRecalcClient } from './client';
import { applyPatches } from './protocol';
import { RecalcService } from './service';

const sheet = () => buildSheet('s', 'S', [[1, '=A1+1', '=B1*2'], [5, '=SOMA(A1:A2)']]);

async function exercise(client: ReturnType<typeof createRecalcClient>) {
  const init = await client.init([sheet()]);
  assert.ok(init.patches.length >= 3);
  let local = sheet();
  local = applyPatches(local, init.patches);
  assert.equal(valueAt(local, 'C1'), 4);

  const delta = await client.applyEdits([{ sheetId: 's', row: 0, col: 0, raw: '10' }]);
  assert.ok(delta.recalculated >= 3);
  assert.ok(delta.patches.length <= 5, 'só o ramo afetado volta');
  local = applyPatches(local, delta.patches);
  assert.equal(valueAt(local, 'C1'), 22);
  assert.equal(valueAt(local, 'B2'), 15);

  const cleared = await client.applyEdits([{ sheetId: 's', row: 0, col: 1, raw: '' }]);
  assert.equal(cleared.patches.find(p => p.key === 'R0C1')?.cell, null);
}

describe('createRecalcClient', () => {
  it('modo síncrono (fallback)', async () => {
    const client = createRecalcClient({ forceSync: true });
    await exercise(client);
    assert.equal(client.mode, 'sync');
  });

  it('sem Worker no ambiente cai para síncrono sozinho', async () => {
    const client = createRecalcClient();
    await client.ping();
    assert.equal(client.mode, 'sync');
  });

  it('protocolo via Comlink (MessageChannel, com clonagem estruturada)', async () => {
    const { port1, port2 } = new MessageChannel();
    Comlink.expose(new RecalcService(), port1 as unknown as Comlink.Endpoint);
    const client = createRecalcClient({ createEndpoint: () => port2 as unknown as Comlink.Endpoint });
    await exercise(client);
    assert.equal(client.mode, 'worker');
    port1.close();
    port2.close();
  });

  it('não altera as planilhas de quem chamou (modo síncrono)', async () => {
    const original = sheet();
    const before = JSON.stringify(original.data);
    await createRecalcClient({ forceSync: true }).init([original]);
    assert.equal(JSON.stringify(original.data), before);
  });

  it('avalia o fluxo de relacionamentos de forma incremental', async () => {
    const a = makeSheet('a', 'A', ['K', 'V'], [['x', 1], ['y', 2]]);
    const b = makeSheet('b', 'B', ['K', 'W'], [['x', 9]]);
    const graph = graphOf([table('ta', 'a'), table('tb', 'b')], [edge('e', 'ta', 'tb')]);
    const client = createRecalcClient({ forceSync: true });
    await client.init([a, b]);
    const first = await client.evaluateFlow(graph, { rowLimit: 1 });
    assert.equal(first.nodes.ta.totalRows, 2);
    assert.equal(first.nodes.ta.rows.length, 1);
    const second = await client.evaluateFlow(graph);
    assert.deepEqual(second.evaluated, []);
    await client.applyEdits([{ sheetId: 'b', row: 1, col: 1, raw: '7' }]);
    const third = await client.evaluateFlow(graph);
    assert.deepEqual(third.evaluated, ['tb']);
  });
});
