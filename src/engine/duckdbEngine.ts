import { Sheet } from '../types/spreadsheet';
import { cellPosToKey } from './formulaParser';
import { getDbClient } from './dbClient';

export async function initDuckDB(): Promise<boolean> {
  const client = getDbClient();
  return await client.init();
}

export interface DuckDBSyncResult {
  success: boolean;
  rowCount: number;
  columnCount: number;
  schemaText?: string;
  columns: string[];
}

export async function syncSheetToDuckDB(sheet: Sheet, tableName = 'uploaded_data'): Promise<DuckDBSyncResult> {
  // 1. Extrair cabeçalhos (Linha 0)
  const headerCols: { colIndex: number; name: string }[] = [];
  for (let c = 0; c < sheet.colCount; c++) {
    const key = cellPosToKey(0, c);
    const cell = sheet.data[key];
    const val = cell?.value ?? cell?.raw;
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const sanitizedName = String(val).trim().replace(/[^a-zA-Z0-9_]/g, '_');
      headerCols.push({ colIndex: c, name: sanitizedName || `col_${c}` });
    }
  }

  if (headerCols.length === 0) {
    return {
      success: false,
      rowCount: 0,
      columnCount: 0,
      schemaText: 'Tabela vazia sem cabeçalhos definidos na linha 1.',
      columns: [],
    };
  }

  // 2. Extrair dados das linhas 1..N
  const rows: Record<string, any>[] = [];
  for (let r = 1; r < sheet.rowCount; r++) {
    let hasData = false;
    const rowObj: Record<string, any> = {};

    for (const h of headerCols) {
      const key = cellPosToKey(r, h.colIndex);
      const cell = sheet.data[key];
      const val = cell?.value !== undefined && cell?.value !== null ? cell.value : (cell?.raw ?? null);
      if (val !== null && val !== '') {
        hasData = true;
      }
      rowObj[h.name] = val;
    }

    if (hasData) {
      rows.push(rowObj);
    }
  }

  const columns = headerCols.map(h => h.name);
  const schemaText = headerCols.map(h => `- ${h.name}`).join('\n');

  try {
    const client = getDbClient();
    await client.init();

    // Use RPC method to insert
    await client.insertJson(tableName, rows);
    
    return {
      success: true,
      rowCount: rows.length,
      columnCount: columns.length,
      schemaText,
      columns,
    };
  } catch (err) {
    console.error('Erro ao sincronizar com DuckDB Worker', err);
    return {
      success: false,
      rowCount: 0,
      columnCount: 0,
      schemaText: 'Erro ao carregar dados no motor SQL.',
      columns: [],
    };
  }
}

export async function runQuery(sql: string): Promise<any[]> {
  const client = getDbClient();
  await client.init();
  return await client.query(sql);
}


export interface DuckDBQueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
}

export async function queryDuckDB(sql: string): Promise<DuckDBQueryResult> {
  const startTime = performance.now();
  const hasDB = await initDuckDB();

  if (!hasDB) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: performance.now() - startTime,
      error: 'DuckDB-Wasm não está inicializado.',
    };
  }

  try {
    const client = getDbClient();
    const rows = await client.query(sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const executionTimeMs = performance.now() - startTime;

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Math.round(executionTimeMs * 10) / 10,
    };
  } catch (err: any) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: performance.now() - startTime,
      error: err?.message || String(err),
    };
  }
}
