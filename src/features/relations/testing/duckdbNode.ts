// src/features/relations/testing/duckdbNode.ts
// Executor de SQL para testes: DuckDB-WASM em Node (API bloqueante do pacote @duckdb/duckdb-wasm).
// Devolve `null` quando o pacote não puder ser carregado, para o teste se declarar PULADO (nunca "passou").

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { SqlExecutor } from '../sql/parity';

export interface NodeDuckDb {
  run: SqlExecutor;
  close: () => void;
}

export async function openNodeDuckDb(): Promise<NodeDuckDb | null> {
  try {
    const requireFromProject = createRequire(join(process.cwd(), 'package.json'));
    const entry = requireFromProject.resolve('@duckdb/duckdb-wasm');
    const dist = dirname(entry);
    const duckdb = requireFromProject(join(dist, 'duckdb-node-blocking.cjs'));
    const bundles = {
      mvp: { mainModule: join(dist, 'duckdb-mvp.wasm'), mainWorker: join(dist, 'duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: join(dist, 'duckdb-eh.wasm'), mainWorker: join(dist, 'duckdb-node-eh.worker.cjs') },
    };
    const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
    await db.instantiate(() => {});
    const connection = db.connect();
    return {
      run: sql => {
        const table = connection.query(sql);
        return table.toArray().map((row: { toJSON: () => Record<string, unknown> }) => row.toJSON());
      },
      close: () => connection.close(),
    };
  } catch {
    return null;
  }
}
