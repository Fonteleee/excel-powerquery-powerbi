import * as Comlink from 'comlink';
import type { DbApi } from '../workers/duckdb.worker';

let dbClient: Comlink.Remote<DbApi> | null = null;

export function getDbClient() {
  if (!dbClient) {
    const worker = new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), {
      type: 'module',
    });
    dbClient = Comlink.wrap<DbApi>(worker);
  }
  return dbClient;
}
