import * as Comlink from 'comlink';
import * as duckdb from '@duckdb/duckdb-wasm';

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;

const dbApi = {
  async init(): Promise<boolean> {
    if (dbInstance && connInstance) return true;
    try {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
      );
      
      const worker = new Worker(worker_url);
      const logger = new duckdb.VoidLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);
      
      const conn = await db.connect();
      dbInstance = db;
      connInstance = conn;
      return true;
    } catch (err) {
      console.warn('DuckDB Worker failed to initialize', err);
      return false;
    }
  },

  async query(sql: string): Promise<any[]> {
    if (!connInstance) {
      const initialized = await this.init();
      if (!initialized || !connInstance) throw new Error('DuckDB not initialized');
    }
    const result = await connInstance.query(sql);
    return result.toArray().map(row => row.toJSON());
  },

  async getTableSchema(tableName: string) {
    if (!connInstance) return null;
    const res = await connInstance.query(`DESCRIBE ${tableName}`);
    return res.toArray().map(r => r.toJSON());
  },

  async insertJson(tableName: string, data: any[]) {
    if (!connInstance) return;
    // We pass data as JSON string to the worker, then insert
    const jsonStr = JSON.stringify(data);
    await connInstance.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json_auto('${jsonStr}')`);
  }
};

Comlink.expose(dbApi);
export type DbApi = typeof dbApi;
